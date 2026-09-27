# Coach guide

Natball Insights keeps one coach task on screen at a time. It has one active Season and, within it, one live Match.

## What opens when you launch the app

- **Stage 1 — Team Setup** opens only when no reusable Team has been saved. Enter a Team name and save it. That Team is reused in later Seasons, so Stage 1 is then skipped.
- **Stage 2 — Season Setup** opens when there is a saved Team but no active Season. Enter a Season name to create the active Season. It remains active until you end it yourself.
- **Stage 3 — Add Opponent** opens when an active Season has no saved Match setup. Choose an earlier Opposition or add one, then confirm the Match date.
- If Match setup was interrupted, the app resumes the saved current stage: Add Opponent, **Stage 4 — Match Squad**, or **Stage 5 — Court Setup**.
- If a Match has an active Quarter, the app opens its **Stage 6 — Match Events** screen, including when you reopen the app mid-Quarter. If Quarter 1, 2, or 3 has ended and the next Quarter has not begun, it opens the prefilled **Stage 5 — Court Setup** with planning statistics instead.

Use the header **Open menu** button for secondary tasks. It contains **End season** (disabled while a Match is live), **Backup & restore**, and **Match history**. Return from a secondary screen to continue the current match-day stage.

## Prepare a Match

### Stage 3 — Add Opponent

Choose an existing Opposition or enter a new one, and choose the Match date. **Continue to Match Squad** is available only once both are present. Your partial selection is saved, so it can be resumed.

### Stage 4 — Match Squad

Select existing Players or add Players to the Match Squad. At least five and at most twelve unique Players are required before **Continue to Court Setup** becomes available. The selection is saved while you work.

The Match Squad becomes fixed as soon as the Match starts. You cannot add Players during a live Match or between Quarters; later Court changes choose only from this Squad.

### Stage 5 — Court Setup

Set the Quarter 1 Court in the fixed Position order: Goal Keeper, Goal Defence, Wing Defence, Centre, Wing Attack, Goal Attack, Goal Shooter. Assign five to seven unique Squad Players; unfilled Positions are allowed. **Start Match** is disabled until that minimum is met.

Starting the Match starts Quarter 1 and opens Stage 6.

## Record Match Events

Stage 6 is the live Match screen. It shows only Players who currently occupy a Court Position, in GK, GD, WD, C, WA, GA, GS order. Each row has the Player, Position abbreviation, and the same ordered event-icon controls with their counts. Goals and misses are enabled only for GA and GS; those controls are visibly unavailable for other Positions.

Tap an event icon to record it against the current Match, active Quarter, Player, and Position. The large score is the Match score; the smaller score is the active-Quarter score.

- **Opposition goal** records a distinct event without a Player or Position.
- **Record Substitution** replaces the actionable row for one Position. The outgoing Player disappears from the current Court immediately, while events already recorded stay attributed to that outgoing Player–Position stint.
- **Undo last event** reverses the newest active-Quarter event, including an Opposition goal.
- The **Quarter event feed** is chronological. Player events can be corrected or removed; Opposition goals can be removed. The feed keeps the live screen auditable without leaving it.
- **End quarter** ends the current Quarter.

## Plan the next Quarter and finish the Match

After Quarter 1, 2, or 3 ends, the next Quarter Court screen opens with the final Court prefilled. Reposition Squad Players as needed; no new Players can be added.

The same screen includes a compact statistics panel. It starts on **Previous quarter statistics** and can switch to **All Match statistics**. The switch changes only the statistics panel: current Court selectors and unsaved selections remain visible and usable. Statistics are grouped by Player–Position stint, so one Player may have more than one row after playing different Positions.

When five to seven unique Players are assigned, select **Start Quarter** to return directly to Stage 6. After Quarter 4, there is no next-Court screen: check the displayed score and select **Confirm and finalise**. Finalised Matches are read-only.

If a Match cannot be completed, open **More match actions** during live capture and choose **Abandon match**. An abandoned Match is terminal and retains its score and recorded events.

## History, reports, and recovery

Open **Match history** from the header menu to view live or terminal Matches. Terminal Match records show Quarter scores, Courts, substitutions, and Player–Position events. Use **Download CSV** for spreadsheet analysis (see [the CSV schema](reports/csv-schema.md)) or **Download PDF** for a coach-readable record. Legacy terminated records remain readable and exportable.

Open **Backup & restore** from the header menu to download all locally stored Team, Season, Match, Court, event, and result data as JSON. To restore, paste backup JSON into **Backup data** and choose:

- **Merge - keep current data** to add records that are not already present.
- **Replace all local data** to replace local records after acknowledging the warning.

Invalid or incompatible backups are rejected without changing the current data.
