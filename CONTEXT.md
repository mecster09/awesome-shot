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
The set of at least five players selected for a match and eligible to take court during it.
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

**Substitution**:
A recorded change to a court position, replacing its player or filling a vacant position. It may occur during a live quarter or before a quarter begins.
_Avoid_: Court change

**Quarter score**:
The goals scored by each side in one quarter.

**Match score**:
The cumulative goals scored by each side across all quarters of a match.
