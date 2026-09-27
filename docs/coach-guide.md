# Coach guide

## The normal journey

Natball Insights keeps the match-day journey focused: **Season Setup**, **Match Setup**, **Quarter Setup**, then the live **Match Centre**. Only one active Season and one live Match can exist at a time.

### 1. Set up a Season

When there is no active Season, the app opens **Season Setup**. Give the Season a name, then select a saved Team or create a reusable Team. Once created, the Season is active and the app moves directly to **Match Setup**.

Use **Season settings** only when you need to end a Season or recover data. Ending a Season requires confirmation and is available only when all of its Matches are terminal. Ended Seasons remain available through retained Match history.

### 2. Set up a Match

Choose an active Opposition or add one inline. Then select the Match date and a Squad of five to twelve unique players. You can add a late or new player while making the Squad selection.

There is no saved Match draft: selecting **Continue to Quarter Setup** keeps the setup in memory, and the Match is persisted only when you confirm the Quarter 1 Court.

### 3. Confirm each Quarter Court

Assign five, six, or seven Squad players to Positions. A Court may have up to two vacant Positions, but no player can occupy more than one Position. Select **Start Quarter 1** to begin live recording.

After each ended Quarter from 1 to 3, confirm the next Quarter's Court before recording resumes. The previous Court is pre-filled, so you can reposition players or add a late-arriving player to the Squad. Changes between Courts are retained as pre-quarter Substitutions. After Quarter 4, confirm and finalise the displayed Match score instead of setting up another Court.

## Record in the Match Centre

The Match Centre shows only the current Court, with at most seven player rows. Its large score is the cumulative **Match score**; the smaller **Quarter score** covers the current Quarter only.

- Use a player's accessible event icons to record player events. Goals and misses are available only for Goal Attack and Goal Shooter. A goal recorded this way updates both the player event total and your Match score.
- Use the visually separate **Opposition goal** control for opposition scoring.
- Select **Record Substitution** to replace the player in one Position or fill a vacant Position. The player picker excludes people already on the Court.
- **Undo last player event** applies only to the latest player event in the active Quarter. It does not undo an opposition goal or a Substitution.
- Select **History** to leave the live recording surface and view retained Matches. Use **Back to Match Centre** to resume the live Match.
- Select **End quarter** when the Quarter finishes. Recording resumes only after the next Quarter Court is confirmed.

## Complete or abandon a Match

After Quarter 4 ends, check the displayed score and select **Confirm and finalise**. A completed Match is read-only and retains its Quarter history, scores, player events, and Substitutions.

If a live Match cannot be completed, select **Abandon match**. During live recording, open **More match actions** first; after a Quarter has ended, the action is available on the Quarter-complete screen. An Abandoned Match is terminal, has no winner, and retains its score at abandonment and all captured statistics.

## Review and export retained Matches

Open **Match history** to select a completed or Abandoned Match. Its read-only record includes the final score, Quarter scores, Courts, player-position events, and Substitutions.

Use **Download CSV** for spreadsheet analysis; the columns are documented in [the CSV schema](reports/csv-schema.md). Use **Download PDF** for a coach-readable record.

New Matches cannot be terminated. If an older backup contains a terminated record, it remains readable, exportable, and restorable as a no-winner legacy record.

## Back up or restore data

Backup and restore are recovery controls, not match-day actions. Open **Season settings** and select **Download backup** to save locally held Season, Team, Match, Quarter, player event, Substitution, and result history as JSON.

To restore a backup, paste its contents into **Backup data** and choose an import mode:

- **Merge - keep current data** adds records that are not already present.
- **Replace all local data** replaces every local record after you acknowledge the warning.

Invalid or incompatible backups are rejected without changing the current data.
