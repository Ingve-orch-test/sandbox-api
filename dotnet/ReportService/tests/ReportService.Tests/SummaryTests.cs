using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using ReportService;

namespace ReportService.Tests;

public class CalculatorTests
{
    private static Order O(int id, string date, string region, decimal amount) =>
        new(id, DateOnly.Parse(date), region, amount);

    private static readonly Order[] Small =
    [
        O(1, "2025-01-05", "North", 10.00m),
        O(2, "2025-01-20", "North", 20.50m),
        O(3, "2025-01-21", "South", 5.25m),
        O(4, "2025-02-01", "North", 100.00m),
        O(5, "2024-12-31", "East", 1.00m),
        O(6, "2025-01-31", "South", 4.75m),
    ];

    [Fact]
    public void KnownSmallSet_ProducesExactExpectedRows()
    {
        var report = SummaryCalculator.Summarize(Small);

        Assert.Equal(6, report.OrderCount);
        Assert.Equal(141.50m, report.TotalAmount);
        Assert.Equal(4, report.Rows.Count);

        Assert.Equal(new SummaryRow("2024-12", "East", 1, 1.00m, 1.00m), report.Rows[0]);
        Assert.Equal(new SummaryRow("2025-01", "North", 2, 30.50m, 15.25m), report.Rows[1]);
        Assert.Equal(new SummaryRow("2025-01", "South", 2, 10.00m, 5.00m), report.Rows[2]);
        Assert.Equal(new SummaryRow("2025-02", "North", 1, 100.00m, 100.00m), report.Rows[3]);
    }

    [Fact]
    public void EmptyInput_GivesEmptyReport()
    {
        var report = SummaryCalculator.Summarize([]);
        Assert.Equal(0, report.OrderCount);
        Assert.Equal(0m, report.TotalAmount);
        Assert.Empty(report.Rows);
    }

    [Fact]
    public void SingleOrder_GivesOneRow()
    {
        var report = SummaryCalculator.Summarize([Small[0]]);
        var row = Assert.Single(report.Rows);
        Assert.Equal("2025-01", row.Month);
        Assert.Equal("North", row.Region);
    }

    [Fact]
    public void SameMonthDifferentYear_AreSeparateGroups()
    {
        var report = SummaryCalculator.Summarize([O(1, "2024-03-01", "A", 1m), O(2, "2025-03-01", "A", 1m)]);
        Assert.Equal(2, report.Rows.Count);
        Assert.Equal("2024-03", report.Rows[0].Month);
    }

    [Fact]
    public void Rows_AreOrderedByMonthThenRegion()
    {
        var report = SummaryCalculator.Summarize(Small.Reverse());
        var keys = report.Rows.Select(r => (r.Month, r.Region)).ToList();
        Assert.Equal(keys.OrderBy(k => k.Month, StringComparer.Ordinal).ThenBy(k => k.Region, StringComparer.Ordinal), keys);
    }

    [Fact]
    public void InputOrder_DoesNotChangeResult()
    {
        Assert.Equal(SummaryCalculator.Summarize(Small).Rows, SummaryCalculator.Summarize(Small.Reverse()).Rows);
    }

    [Fact]
    public void AverageIsRoundedToTwoDecimals()
    {
        var report = SummaryCalculator.Summarize([O(1, "2025-01-01", "A", 1m), O(2, "2025-01-02", "A", 1m), O(3, "2025-01-03", "A", 2m)]);
        Assert.Equal(1.33m, report.Rows[0].AverageAmount);
    }

    [Fact]
    public void RowTotals_AddUpToReportTotals()
    {
        var report = SummaryCalculator.Summarize(OrderGenerator.Generate(5_000));
        Assert.Equal(report.OrderCount, report.Rows.Sum(r => r.OrderCount));
        Assert.Equal(report.TotalAmount, report.Rows.Sum(r => r.TotalAmount));
    }
}

public class GeneratorTests
{
    [Fact]
    public void DefaultCount_Is100000() => Assert.Equal(100_000, OrderGenerator.Generate().Count);

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(250)]
    public void Generate_HonoursCount(int n) => Assert.Equal(n, OrderGenerator.Generate(n).Count);

    [Fact]
    public void Generate_NegativeCount_Throws() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => OrderGenerator.Generate(-1));

    [Fact]
    public void SameSeed_GivesIdenticalOrders() =>
        Assert.Equal(OrderGenerator.Generate(1_000, 7), OrderGenerator.Generate(1_000, 7));

    [Fact]
    public void DifferentSeed_GivesDifferentOrders() =>
        Assert.NotEqual(OrderGenerator.Generate(1_000, 7), OrderGenerator.Generate(1_000, 8));

    [Fact]
    public void Orders_HaveValidRegionsAmountsAndDates()
    {
        var orders = OrderGenerator.Generate(10_000);
        Assert.All(orders, o =>
        {
            Assert.Contains(o.Region, OrderGenerator.Regions);
            Assert.InRange(o.Amount, 1.00m, 999.99m);
            Assert.Equal(2025, o.Date.Year);
        });
    }

    [Fact]
    public void Ids_AreUniqueAndSequential() =>
        Assert.Equal(Enumerable.Range(1, 500), OrderGenerator.Generate(500).Select(o => o.Id));
}

public class EndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    public EndpointTests(WebApplicationFactory<Program> factory) => _factory = factory;

    [Fact]
    public async Task Summary_Returns200Json()
    {
        var res = await _factory.CreateClient().GetAsync("/reports/summary");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("application/json", res.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Summary_CoversAll100000Orders_AndMatchesDirectComputation()
    {
        var report = await _factory.CreateClient().GetFromJsonAsync<SummaryReport>("/reports/summary");
        Assert.NotNull(report);
        Assert.Equal(100_000, report.OrderCount);
        var expected = SummaryCalculator.Summarize(OrderGenerator.Generate());
        Assert.Equal(expected.TotalAmount, report.TotalAmount);
        Assert.Equal(expected.Rows, report.Rows);
    }

    [Fact]
    public async Task Summary_HasTwelveMonthsTimesFiveRegions()
    {
        var report = await _factory.CreateClient().GetFromJsonAsync<SummaryReport>("/reports/summary");
        Assert.Equal(12 * OrderGenerator.Regions.Length, report!.Rows.Count);
    }

    [Fact]
    public async Task Summary_IsRepeatableAcrossCalls()
    {
        var c = _factory.CreateClient();
        Assert.Equal(await c.GetStringAsync("/reports/summary"), await c.GetStringAsync("/reports/summary"));
    }

    [Fact]
    public async Task UnknownRoute_Returns404() =>
        Assert.Equal(HttpStatusCode.NotFound, (await _factory.CreateClient().GetAsync("/nope")).StatusCode);
}
