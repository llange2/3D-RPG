# Bereinigung der Rätselliste (generiert)

Erzeugt von `tools/export/export_world_riddles.py` aus `.ignore/quests_1.2.md`; Ergebnis `src/data/riddles-world.json`. Die Kampagne nutzt weiter die unveränderte `RIDDLES_MASTER`.

- Vorher: 300 Rätsel. Nachher: **257** (Ziel 250 bis 300).
- Verschiedene Antworten: 172; höchstens 4 Rätsel je Antwort.
- Für quest_6 (ein Wort, 3 bis 8 Buchstaben, nicht in der Frage): 158 verschiedene Wörter.

## Gestrichen (Grund)

- #1: answer 'gold coin' is two words (coin has three riddles already)
- #13: 'death by arrow' is no single word
- #14: 'death by axe' is no single word
- #15: 'death by hanging' is no single word
- #18: broken: the answer stands in the question text
- #20: the answer 'that' stands in the question
- #24: one-letter answer
- #26: anachronism: the piano (the riddle is about keys and time)
- #30: anachronism: iced tea
- #49: the answer 'bulette' is a game monster, not guessable
- #50: broken text ('rugo f smothering')
- #66: broken: question holds answer and instructions
- #69: anachronism: a watch with hands
- #80: anachronism: the pencil (the answer was graphite)
- #82: one-letter answer
- #83: 'counterfeit money' is two words
- #86: four words
- #94: one-letter answer
- #99: one-letter answer
- #104: anachronism: the postage stamp
- #105: same riddle as #3
- #107: anachronism: tea and the teapot
- #109: anachronism: the piano
- #110: 'right elbow' is two words
- #115: one-letter answer
- #119: 'are you asleep' is no word
- #123: 'letter e' is no word
- #125: 'rubber band' is two words
- #130: 'garbage truck' is two words
- #133: anachronism: the computer keyboard
- #136: anachronism: the postage stamp
- #145: the answer 'echo' stands in the question
- #150: anachronism: the envelope
- #156: anachronism: the telephone ('What has a ring but no finger?')
- #159: same question as #133 (piano or keyboard)
- #166: answer 'echo' already has 4 riddles
- #167: anachronism: the postage stamp
- #169: anachronism: tea and the teapot
- #173: anachronism: the doughnut
- #174: anachronism: the umbrella
- #178: 'deck of cards' (same riddle as #40 and #141)
- #179: 'deck of cards' (same riddle as #141)
- #181: answer 'book' already has 4 riddles
- #182: anachronism: the chalkboard
- #185: same question as #162
- #186: same question as #100
- #187: anachronism: the computer keyboard
- #188: anachronism: the telephone
- #189: 'day/night' is two words
- #193: same question as #120
- #197: one-letter answer
- #201: answer 'book' already has 4 riddles
- #204: answer 'river' already has 4 riddles
- #205: same riddle as #80
- #207: one-letter answer
- #218: anachronism: the password
- #228: answer 'book' already has 4 riddles
- #235: 'fool's gold' is two words
- #267: answer 'memory' already has 4 riddles
- #268: answer 'echo' already has 4 riddles
- #285: answer 'memory' already has 4 riddles
- #299: answer 'memory' already has 4 riddles

## Repariert (neue Antwort, alte bleibt als Alias)

- #57: `chest` (Alias: treasure chest)
- #93: `ring` (Alias: wedding ring)
- #141: `cards` (Alias: deck of cards, deck)
- #144: `ball` (Alias: tennis ball)

## Hinzugefügt (Rätsel des Mittelalters, 40. Playtest)

- #301: `anvil`
- #302: `bell`
- #303: `harp`
- #304: `quill`
- #305: `moat`
- #306: `gate`
- #307: `shield`
- #308: `bread`
- #309: `dragon`
- #310: `crown`
- #311: `key`
- #312: `spider`
- #313: `well`
- #314: `trumpet`
- #315: `chain`
- #316: `oath`
- #317: `horse`
- #318: `torch`
- #319: `snow`

## Länge der Antworten

- 3 Buchstaben: 26
- 4 Buchstaben: 83
- 5 Buchstaben: 57
- 6 Buchstaben: 43
- 7 Buchstaben: 25
- 8 Buchstaben: 11
- 9 Buchstaben: 10
- 11 Buchstaben: 2
