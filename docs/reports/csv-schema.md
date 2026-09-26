# Terminal match CSV schema

Each row represents a player-position pairing in one retained quarter. Rows include every player-position from the quarter's starting court and recorded court changes, even when every statistic is zero.

Identity and score context columns are `match_id`, `match_date`, `team_name`, `opposition_name`, `terminal_status`, `outcome`, `winner`, `final_own_score`, `final_opposition_score`, `quarter`, `quarter_own_score`, `quarter_opposition_score`, `player_id`, and `position`.

The remaining public columns are one total for each supported player statistic: `Successful Centre Pass Received`, `Tip`, `Intercept`, `Unforced Errors`, `Contact Conceded`, `Obstruction Conceded`, `Goals`, and `Misses`.
