# Coach guide

## Before the match

1. In **Seasons**, add the season and your team name.
2. In **Players**, add the players you may select for a match. A nickname is optional.
3. In **Opposition**, add the other teams you play. Select the opposition for the next match if needed.
4. Select **Create match**, choose the season, opposition, date, and up to 12 squad players.
5. Set a unique player in each of the seven starting positions, then select **Start Quarter 1**.

## Capture a live quarter

Use the position cards to record player statistics. Goals and misses can only be recorded for Goal Attack and Goal Shooter. Use **Opposition goal** for the opposition score.

Use **Undo last action** only for the newest action. To change the current court, select **Change court**, choose the complete new seven, and apply it. Later statistics use the new court.

Select **End quarter** when the quarter finishes. No further capture is possible until the next quarter starts. The final court automatically becomes the starting court for the next quarter.

## Correct an earlier quarter

While a later quarter is live, the ended quarters appear in **Review ended quarters**. For each recorded action, you can:

- Select **Edit statistic** to move it to the correct player, position, or statistic.
- Select **Remove action** to remove an incorrect record and decrement its total.

Corrections remain available until the match reaches a terminal outcome.

## Finish, abandon, or terminate a match

After Quarter 4 ends, check the displayed final score and select **Confirm and finalise**. Finalisation locks every match record.

If a live match cannot be completed, choose one of these options:

- **Abandon - team wins** or **Abandon - opposition wins** records an incomplete result with a declared winner.
- **Terminate game** records an incomplete result with no winner.

Abandoned and terminated matches retain the statistics already captured. They are read-only and cannot be deleted.

## Review and export terminal matches

Select **View match record** for a finalised, abandoned, or terminated match. The read-only record shows the outcome, scores, quarter history, starting courts, court changes, and player-position totals.

Use **Download CSV** for spreadsheet analysis. Its columns are documented in [the CSV schema](reports/csv-schema.md). Use **Download PDF** for a coach-readable match record.

## Back up or restore data

In **Protect your data**, select **Download backup** to save all locally held setup and match data as a JSON backup. Store it somewhere safe before changing device or clearing browser data.

To restore a backup, paste its contents into **Backup data** and choose an import mode:

- **Merge - keep current data** adds records that are not already present and keeps the current data.
- **Replace all local data** replaces every local record. The app requires you to acknowledge the warning before importing.

Invalid or incompatible backups are rejected without changing the current data.
