# General

- Whenever the player receives an achievement, show the scroll dialog with the image of the achievement and the text "Congratulation, you have unlocked the \[achievement name\] achievement!" and an "Okay" button to confirm
- In the title screen under the 3 buttons, add a 4th button which spans the same size of the three and label it "Achievement progress: \[% of completed achievements\]. Clicking on the button open the achievement overview
- Achievement overview: show the information from the section "Achievments" (column "Name", "Description" and the image (if unlocked achievement, otherwise the locked achievement playceholder). Add a progress bar, where indicated

# Achievements

| Name | Description | Details | Image |
| --- | --- | --- | --- |
| Cuteness over Function | Have the Capybara mascot throughout the game | Start=true<br>If the player enters any dungeon >1 with a mascot other than the Capybara, set this achievement to false. | Capybara |
| Drunk blabbermouth | Get 3 passwords from taverns in a single game | Start=false<br>Count every tavern answer, which is a real password, rather than filler. Once  player has at least collected 3, achievement is fulfilled | 2 beer mugs |
| For the king! | Finish a game without robbing any chests in the throne room | Start=true<br>If a player opens any of the high value chests (located close to each king) set to false. | crown |
| Rich like a dragon | Collect a billion gold over any number of games | Start = 0<br>Any gold income (loot, sales, bank interest) is added to the counter. The counter does not reset for new games, but is a total. Once it reaches 1 billion gold, the achievement drops. Show progress bar. Important: if an item is "bought back" the counter is reduced to prevent loophole | pile of treasure (mainly gold) |
| Antiquity trader | Return 30 artifacts over any number of games | Start = 0<br>Any artifact returned is counted. Once 50 are reached, achievement drops. Show progress bar. | holy grail (without christian cross or beams) |
| I am unstoppable | Reach level 100 with a character | Start=false<br>If any character reaches L100 (trained), achievement drops | Dwarven face, smiling, stars as eyes |
| Black is beautiful | Have a character fully equipped in Obsidian gear | Start=false<br>Once a character has only Obsidian weapon & armor, drop achievement (some characters, e.g. wizards cannot reach the achievement as they cannot hold shields/reanged weapons) | black plate armor |
| Up, up and away | Finish the game | start=false<br>Once the player finishes the game, achievement drops | spaceship |
| I don't feel so good | Have a character diseased, poisoned and crazy | start=false<br>Once any character has all three conditions at the same time, drop the achievement | Human knight's face, sweating like he is sick |
| Where is the princess? | Slay a dragon | start=false<br>Once the party defeats a Green dragon (or boss dragon), achievement drops | Dragon |
| Eviction | Destroy any monster hut | start=false<br>Once the party burns down its first hut, achievement drops | burnt remains of a monster hut |
| Terminate this! | Destroy a terminator | start=false<br>Once the party defeats a Terminator robot, achievement drops | cogwheel |
| Colorful delight | Solve a crystal quest | start=false<br>Once the party solves a quest\_8, achievement drops | crystal |
| Found a way out! | Complete a L5 labyrinth | start=false<br>Once the party solves a quest in a dungeon\_3 (Level 5), achievement drops | maze |
| Bribery | Get gold from the Pirate Queen | start=false<br>Once the party gets money from the Pirate Queen (by carrying at least a pearl of youth and beauty), achievement drops | pirate flag |
| Stop moaning | Solve a moaning statues quest | start=false<br>Once the party solves a quest\_1, achievement drops | a female hero covering her ears with her hands |
| May I ask for directions? | Solve a direction of faces quest | start=false<br>Once the party solves a quest\_2, achievement drops | compass |
| Who is it? | Solve a gong quest | start=false<br>Once the party solves a quest\_3, achievement drops | gong |
| ...and 1 makes 5. | Solve a fallen warrior quest | start=false<br>Once the party solves a quest\_4, achievement drops | Hand counting (showing 3 fingers) |
| Who is the boss now? | Defeat a boss monster | start=false<br>Once the party solves a quest\_5, achievement drops | An orc boss monster |
| Can I buy an "E"? | Solve a secret word quest | start=false<br>Once the party solves a quest\_6, achievement drops | the 4 characters:<br>'\_VIL' |
| Riddle me this! | Solve 30 riddles over any number of games | Start = 0<br>Whenever the party solves a riddle (Miniquest), increase the counter. Once it reaches 30, drop achievement. Show progress bar. | question mark |
| Perfect adventurers | Complete 100 dungeons over any number of games | Start = 0<br>Whenever the party completes a dungeon/tower/cave/space ship section increase the counter. Once it reaches 100, drop achievement. Show progress bar. | silhoute of 4 heroes from behind |
| Time to retire | Have a 80+ year old character | start=false<br>Once a character's age reaches at least 80 (incl. magical age), drop achievment | old man with a walking stick |
| That's gotta sting | Deal 250 damage in one melee hit | start=false<br>Once a character, deals >=250 health point damage to any monster with a melee attack, drop achievment | hand with a sword |
