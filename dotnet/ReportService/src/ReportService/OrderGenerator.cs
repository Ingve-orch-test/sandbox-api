namespace ReportService;

public static class OrderGenerator
{
    public static readonly string[] Regions = ["North", "South", "East", "West", "Central"];
    public const int DefaultSeed = 20260101;
    public const int DefaultCount = 100_000;

    /// <summary>Deterministic: the same seed and count always give the same orders.</summary>
    public static List<Order> Generate(int count = DefaultCount, int seed = DefaultSeed)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(count);
        var rng = new Random(seed);
        var start = new DateOnly(2025, 1, 1);
        var orders = new List<Order>(count);
        for (var i = 1; i <= count; i++)
        {
            var date = start.AddDays(rng.Next(0, 365));
            var region = Regions[rng.Next(Regions.Length)];
            var amount = rng.Next(100, 100_000) / 100m; // 1.00 .. 999.99
            orders.Add(new Order(i, date, region, amount));
        }
        return orders;
    }
}
