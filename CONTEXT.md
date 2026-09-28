# Netball Match Coaching

This context records a coach's setup and live capture of netball matches, including the season, team, squad, quarter, and match outcome.

## Season and team

**Team**:
A reusable named coaching team whose player and opponent history may be used in later seasons.
_Avoid_: Season team, team-name field

**Season**:
A named, team-specific collection of matches. An ended season is readable but accepts no further matches or edits.
_Avoid_: Campaign, active season after ending

## Matches

**Match**:
A game recorded for a season against one opposition. It is set up immediately before play, retains complete quarter history, and ends as completed or abandoned.
_Avoid_: Game record, draft match

**Live match**:
The only match a coach may record at a time. It prevents starting another match and ending its season until it becomes a terminal match.

**Terminal match**:
A completed or abandoned match that retains its score and statistics and no longer accepts live recording.

**Abandoned match**:
A terminal match ended before completion that retains its score-at-abandonment and all player/team statistics, without a winner.
_Avoid_: Deleted match, terminated match

**Squad**:
The fixed set of at least five players selected before a match begins and eligible to take court during it.
_Avoid_: Starting court, lineup

**Quarter**:
One ordered segment of a match. Its player event counts are distinct from other quarters while all quarters remain part of the match history.
_Avoid_: Period

**Court**:
The up-to-seven players occupying named positions in a quarter. A court may legally have two vacant positions at its start.
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
A recorded change to a court position, replacing its player or filling a vacant position. It may occur during a live quarter or before a quarter begins.
_Avoid_: Court change

**Quarter score**:
The goals scored by each side in one quarter.

**Match score**:
The cumulative goals scored by each side across all quarters of a match.

**Statistics summary**:
A view of player events for either one completed quarter or the cumulative match. It includes only the Match Squad and has one row for each player-position stint.
_Avoid_: Player scoreboard, all-player statistics

**Score strip**:
The compact live-match summary showing the active Quarter, Match score, Quarter score, and Opposition-goal action. It does not introduce separate shooting-efficiency tracking.
_Avoid_: Dashboard, score card

**Event cell**:
The fixed, touch-sized control in a current-Court row that shows one Player-event icon and its count. Goals and misses are enabled only at Goal Attack and Goal Shooter.
_Avoid_: Stat button, coloured tile

**Event-feed drawer**:
The compact-tablet presentation of the active-quarter Event feed. It shows the latest event while collapsed and opens before a coach can correct or remove an event.
_Avoid_: Event modal, activity panel

## Coach navigation

**Live Match**:
The navigation destination that returns a coach to the one live match, when one exists, without changing its active stage. It replaces Setup Match after Quarter 1 starts.
_Avoid_: Home, current game

**Setup Match**:
The navigation destination that returns a coach to the current resumable match-preparation stage before Quarter 1 starts. It is replaced by Live Match once the match begins.
_Avoid_: New match, match home

**No Match in progress**:
The empty state shown by Setup Match when the active season has neither resumable match preparation nor a live match. Its primary action begins Match setup at Add Opponent.
_Avoid_: Dashboard, home screen

**Match History**:
The navigation destination for opening retained live and terminal match records.
_Avoid_: Archive

**Settings**:
The secondary destination for season lifecycle and recovery controls, including End Season and Backup & restore.
_Avoid_: Season settings, overflow menu

**Primary action bar**:
The persistent bottom-of-stage area above coach navigation that contains the one primary action for the current setup stage. It remains visible and disabled until the stage minimum is complete.
_Avoid_: Submit footer, floating button

**Player picker**:
The contained searchable selection surface for choosing the Match Squad before the match begins. Selected players are represented as compact chips while the fixed Squad limit remains visible.
_Avoid_: Long player checklist

**Coach navigation**:
The labeled, touch-first persistent navigation for Setup Match or Live Match, Match History, and Settings. It also carries the app identity in place of a persistent root-screen top bar. It is a bottom tab bar on compact and standard tablets and a slim rail on large tablets.
_Avoid_: Header menu, browser navigation

**Focused stage**:
The single-viewport presentation of the current setup or planning task. Its primary action remains available while a deliberately contained surface, such as the Player picker, selected-Squad chips, or statistics panel, scrolls.
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
