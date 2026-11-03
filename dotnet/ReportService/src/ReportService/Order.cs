namespace ReportService;

public sealed record Order(int Id, DateOnly Date, string Region, decimal Amount);

public sealed record SummaryRow(string Month, string Region, int OrderCount, decimal TotalAmount, decimal AverageAmount);

public sealed record SummaryReport(int OrderCount, decimal TotalAmount, IReadOnlyList<SummaryRow> Rows);
