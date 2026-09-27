import { PLAYER_STATISTICS, type TerminalMatchReport } from "./game-session/types";

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function createMatchCsv(report: TerminalMatchReport): string {
  const headers = ["match_id", "match_date", "team_name", "opposition_name", "terminal_status", "outcome", "winner", "final_own_score", "final_opposition_score", "quarter", "quarter_own_score", "quarter_opposition_score", "player_id", "position", ...PLAYER_STATISTICS];
  const rows = report.quarters.flatMap((quarter) => {
    const pairs = new Map<string, { playerId: string; position: string }>();
    for (const entry of [...quarter.startingLineup, ...quarter.substitutions.filter((substitution) => substitution.playerId).map((substitution) => ({ playerId: substitution.playerId!, position: substitution.position }))]) pairs.set(`${entry.playerId}:${entry.position}`, entry);
    for (const statistic of quarter.playerStatistics) pairs.set(`${statistic.playerId}:${statistic.position}`, statistic);
    return [...pairs.values()].map(({ playerId, position }) => {
      const totals = new Map(quarter.playerStatistics.filter((statistic) => statistic.playerId === playerId && statistic.position === position).map((statistic) => [statistic.statistic, statistic.count]));
      return [report.id, report.date, report.teamName, report.oppositionName, report.status, report.outcome.kind, "", report.score.own, report.score.opposition, quarter.number, quarter.ownScore, quarter.oppositionScore, playerId, position, ...PLAYER_STATISTICS.map((statistic) => totals.get(statistic) ?? 0)];
    });
  });
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

const pdfEscape = (text: string) => text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");

export function createMatchPdf(report: TerminalMatchReport): Uint8Array {
  const winner = report.outcome.kind === "abandoned" || report.outcome.kind === "terminated" ? "No winner declared" : report.score.own === report.score.opposition ? "Draw" : `${report.score.own > report.score.opposition ? report.teamName : report.oppositionName} won`;
  const outcomeLabel = report.outcome.kind === "completed" ? "Completed" : `${report.status[0].toUpperCase()}${report.status.slice(1)}`;
  const lines = [
    "Natball Insights match record",
    `${report.teamName} v ${report.oppositionName}`,
    `Date: ${report.date}`,
    `Outcome: ${outcomeLabel} - ${winner}`,
    `Final score: ${report.score.own} - ${report.score.opposition}`,
    ...report.quarters.flatMap((quarter) => [
      `Quarter ${quarter.number}: ${quarter.ownScore} - ${quarter.oppositionScore}`,
      `Starting court: ${quarter.startingLineup.map((entry) => `${entry.position}: ${entry.playerName}`).join(", ")}`,
      ...quarter.substitutions.map((substitution) => `Substitution ${substitution.sequence}: ${substitution.position}: ${substitution.playerName ?? "Vacant"}`),
      ...quarter.playerStatistics.map((statistic) => `${statistic.position} ${statistic.playerName} - ${statistic.statistic}: ${statistic.count}`)
    ]),
    "Game totals",
    ...report.gamePlayerStatistics.map((statistic) => `${statistic.position} ${statistic.playerName} - ${statistic.statistic}: ${statistic.count}`)
  ];
  const wrappedLines = lines.flatMap((line) => line.length <= 88 ? [line] : line.match(/.{1,88}(?:\s|$)|.{1,88}/g) ?? [line]);
  const pages = wrappedLines.reduce<string[][]>((result, line) => {
    const page = result.at(-1);
    if (!page || page.length === 44) result.push([line]); else page.push(line);
    return result;
  }, []);
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R /Lang (en-GB) /MarkInfo << /Marked true >> /ViewerPreferences << /DisplayDocTitle true >> >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  for (const [index, page] of pages.entries()) {
    const content = `BT\n/F1 11 Tf\n50 790 Td\n${page.map((line, lineIndex) => `${lineIndex ? "0 -16 Td\n" : ""}(${pdfEscape(line)}) Tj`).join("\n")}\nET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objects.push("<< /Title (Natball Insights match record) /Lang (en-GB) >>");
  const infoObject = objects.length;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoObject} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
