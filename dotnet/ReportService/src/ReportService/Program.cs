using ReportService;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<IReadOnlyList<Order>>(_ => OrderGenerator.Generate());
var app = builder.Build();

app.MapGet("/reports/summary", (IReadOnlyList<Order> orders) => Results.Ok(SummaryCalculator.Summarize(orders)));

app.Run();

public partial class Program;
