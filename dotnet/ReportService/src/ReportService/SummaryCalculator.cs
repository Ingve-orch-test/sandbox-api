namespace ReportService;

public static class SummaryCalculator
{
    public static SummaryReport Summarize(IEnumerable<Order> orders)
    {
        var rows = orders
            .GroupBy(o => (o.Date.Year, o.Date.Month, o.Region))
            .OrderBy(g => g.Key.Year).ThenBy(g => g.Key.Month).ThenBy(g => g.Key.Region, StringComparer.Ordinal)
            .Select(g =>
            {
                var total = g.Sum(o => o.Amount);
                var count = g.Count();
                return new SummaryRow($"{g.Key.Year:D4}-{g.Key.Month:D2}", g.Key.Region, count, total, Math.Round(total / count, 2));
            })
            .ToList();

        return new SummaryReport(rows.Sum(r => r.OrderCount), rows.Sum(r => r.TotalAmount), rows);
    }
}
