# Netball Match Coaching

This context records a coach's setup and live capture of netball matches, including the season, team, squad, quarter, and match outcome.

## Season and team

**Team**:
A single reusable named coaching team whose Player and opposition history may be used in later Seasons.
_Avoid_: Season team, team-name field

**Season**:
A named collection of Matches for the Team. Only one Season may be active; an ended Season is readable but accepts no further Matches or edits.
_Avoid_: Campaign, active season after ending

**Setup Team**:
The task screen that creates the Team during first run or explicitly renames it from Settings. First-run creation continues to Setup Season; editing from Settings requires an explicit save or cancel.
_Avoid_: Team picker, team list

**Setup Season**:
The task screen that creates a Season when none is active or explicitly renames or ends the active Season from Settings. Editing from Settings requires an explicit save or cancel, ending always requires confirmation, and a Season cannot end until every Match is terminal.
_Avoid_: Season settings, season picker

## Matches

**Match**:
A game recorded for a season against one opposition. It is set up immediately before play, retains the Team and opposition names used when it becomes terminal, retains complete Quarter history, and ends as completed or abandoned.
_Avoid_: Game record, draft match

**Live match**:
The only match a coach may record at a time. It prevents starting another match and ending its season until it becomes a terminal match.

**Terminal match**:
A completed or abandoned match that retains its score and statistics and no longer accepts live recording.

**Abandoned match**:
A terminal match ended before completion that retains its score-at-abandonment and all Player and Team statistics, without a winner. It is available read-only on Match Events and may be exported.
_Avoid_: Deleted match, terminated match

**Squad**:
The fixed set of five to twelve unique Players selected before a Match begins and eligible to take Court during it.
_Avoid_: Starting court, lineup

**Quarter**:
One ordered segment of a match. Its player event counts are distinct from other quarters while all quarters remain part of the match history.
_Avoid_: Period

**Court**:
Between five and seven unique Players occupying named positions in a Quarter. A Court may legally have two vacant positions at its start.
_Avoid_: Starting court

**Position**:
One of the seven named on-court roles. A position may be occupied by at most one player or be vacant.

**Player event**:
A recorded statistic attributed to a player and the position that player occupied when it occurred. Own goals are player events; opposition goals are separate score events.
_Avoid_: Player total, generic event

**Event feed**:
The ordered, live-quarter record of player events and opposition score events.
_Avoid_: Activity log, event history

**Substitution**:
A recorded change to a Court position during a live Quarter, replacing its Player, filling a vacant position, or making a position vacant. Changes made before the next Quarter begins form its starting Court rather than a Substitution.
_Avoid_: Court change

**Quarter score**:
The goals scored by each side in one quarter.

**Match score**:
The cumulative goals scored by each side across all quarters of a match.

**Statistics summary**:
A review view of Player events for a completed Quarter or the cumulative Match. It includes every Player–Position combination that took Court, including combinations with zero events, combines repeated stints in the same Position, and excludes Squad Players who never took Court. Its table may scroll up to the volume produced by the twelve-Player Squad.
_Avoid_: Player scoreboard, all-player statistics

**Match Events**:
The single task screen for recording events in a Live match and reviewing events from Quarter 1, 2, 3, 4, or the overall Match through five fixed tabs. Future Quarter tabs are disabled, the current live Quarter uses a fixed non-scrolling grid of only the up-to-seven current Court Players, completed Quarter and Match tables may scroll, and a terminal Match is read-only. History opens a retained Match on this screen rather than on a separate Match Record screen.
_Avoid_: Match Statistics, Match Record

**Score strip**:
The compact live-match summary showing the active Quarter, Match score, Quarter score, and Opposition-goal action. It does not introduce separate shooting-efficiency tracking.
_Avoid_: Dashboard, score card

**Event cell**:
The fixed, touch-sized control in a current-Court row that shows a Player-event count beneath an abbreviated text header. Goals and misses are enabled only at Goal Attack and Goal Shooter.
_Avoid_: Stat button, coloured tile, icon-only event

**Event-feed drawer**:
The hidden-by-default, independently scrollable presentation of the Event feed for the selected Match Events tab. A Quarter tab shows that Quarter's events; the Match tab shows all events with Quarter labels. The drawer uses most of the viewport when open, preserves the underlying grid position, and signals new events without opening itself.
_Avoid_: Event modal, activity panel

**Event correction**:
An edit or confirmed deletion of a recorded event before Match finalisation. A coach may correct any recorded Quarter in the Live match; terminal Matches do not accept corrections.
_Avoid_: Historical edit, silent deletion

## Coach navigation

**Live Match**:
The one Match currently accepting setup or live recording. Coach navigation returns to its appropriate task screen without changing its active stage.
_Avoid_: Home, current game, navigation label

**Setup Match**:
The task screen for entering the Match date and opposition and selecting the Match Squad before Quarter 1 starts. Opposition and Player history are searchable while new opponents and Players may be added in place.
_Avoid_: New match, match home

**Setup Quarter**:
The task screen for assigning the Court before a Quarter. Its Starting Court and Next Quarter Court modes share the same position-focused layout while exposing mode-specific actions. A live-Quarter Substitution is recorded from Match Events in a contained Position-and-Player modal.
_Avoid_: Quarter Setup, Court Setup

**No Match in progress**:
The empty state shown by Setup Match when the active season has neither resumable match preparation nor a live match. Its primary action begins Match setup at Add Opponent.
_Avoid_: Dashboard, home screen

**History**:
The navigation destination containing every terminal Match, newest first and grouped by Season. Selecting a Match opens it on Match Events.
_Avoid_: Match History, Game History, Archive

**Settings**:
The secondary destination for opening Setup Team or Setup Season and for contained Backup & restore controls.
_Avoid_: Season settings, overflow menu

**Primary action bar**:
The persistent bottom-of-stage area above coach navigation that contains the one primary action for the current setup stage. It remains visible and disabled until the stage minimum is complete.
_Avoid_: Submit footer, floating button

**Player picker**:
The contained searchable selection surface for choosing the Match Squad before the match begins. Selected players are represented as compact chips while the fixed Squad limit remains visible.
_Avoid_: Long player checklist

**Coach navigation**:
The persistent navigation for Match, History, and Settings. It also carries the app identity in place of a persistent root-screen top bar. Every destination always shows both its icon and label, including in the landscape rail, without a menu or expansion control.
_Avoid_: Header menu, browser navigation, collapsible navigation

**Match destination**:
The state-resolving Coach-navigation destination that opens the next relevant task screen without changing Match state. It leads through first-run Team and Season setup, Match setup, Setup Quarter, and the appropriate live or completed view on Match Events.
_Avoid_: Match home, dashboard

**Focused stage**:
The single-viewport presentation of the current setup or planning task. Navigation, context, and the primary action remain available while only a deliberately contained volume surface—such as Player results, History, a review table, the Event-feed drawer, or Backup & restore—scrolls.
_Avoid_: Long page form, independently scrolling navigation

**App mark**:
The small original Natball Insights vector identity used in Coach navigation. It is a simple netball/court-line motif that remains legible at 40–48px and may use a wordmark only where the viewport has room.
_Avoid_: Oversized badge, copied reference logo

**Live-event feedback**:
The immediate visual confirmation of a recorded event: its Event cell count increments and flashes briefly while the Event feed receives the new entry. It never blocks subsequent capture.
_Avoid_: Confirmation dialog, required haptic feedback

**Destructive confirmation**:
The explicit confirmation required before abandoning a Match, ending a Season, or replacing local data. It is a bottom sheet on compact and standard tablets and a centered alert card on large tablets.
_Avoid_: Inline warning, accidental action

**Unsaved Court selection**:
The in-memory Court configuration retained while a coach navigates away during setup. It is preserved when viewing History or Backup and restore; destructive actions warn before proceeding.
_Avoid_: Saved starting court, discarded draft
