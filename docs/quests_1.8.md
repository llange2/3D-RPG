# Änderungsverlauf

| Von Version | Auf Version | Änderung |
| --- | --- | --- |
| 1.2 | 1.3 | **quest\_1 (The Moaning Statues) wird nicht mehr in `dungeon_3` (Labyrinth) gebaut.** Layouts von quest\_1 sind jetzt nur noch `dungeon_2` und `dungeon_4`. Grund: Das Statuenfeld braucht den Eingangsraum als Halle; das Labyrinth hat nur kleine Räume und dünne Wände (36. Playtest, Punkt 13). |
| 1.3 | 1.4 | **ue\_quest4 (Pirate Queen)** ergänzt. Nach der Begegnung taucht das Piratenschiff erst **eine Woche später** wieder auf; ist es außer Sichtweite, steht es wieder an seiner Ausgangsposition. Das Schiff fährt auf tiefem und flachem Wasser, die Begegnung gibt es nur, wenn die Party auf dem Floß steht. |
| 1.4 | 1.5 | \- **spaceship\_1** aktualisiert (Power Crystal darf nur als Teil des Quests verwendet werden)<br>\- **quest\_7** eränzt<br>\- Generierungstabelle aktualisert (Spaceship hat immer quest\_7)<br>\- IDs der neuen Assets (Modelle, Quest-Item, Sounds) in quest\_7 ergänzt (Stand 5. 11. 2026, Version bleibt 1.5)<br>\- **Spaceship (Stand 5. 11. 2026, Version bleibt 1.5):** Die Konsole der Bridge braucht laufende Engines und Life Support UND die schwarze Key Card (statt der Transportröhre des Kontrolldecks); einheitliche Sektionsnamen (Storage Bay, Engine Room, Life Support, Control Room, Bridge); 2 Orbs je Sektion außer der Bridge (8 im Spaceship, 23 auf L5-Dungeons); Pyramide-zu-Sektion zufällig, die der Bridge auf einem L5-Territory; Licht, Sounds und Aktionen gelten für das ganze Schiff; Hinweistexte der Kisten; Terminatoren; Computer (ID68) pro Level mit ComputerScreen |
| 1.5 | 1.6 | \- **dungeon\_3** Levelgrößen ergänzt |
| 1.6 | 1.7 | \- **dungeon\_6** ergänzt |
| 1.7 | - 1.8 | - **Goldene Regel** ergänzt (Dungeons mit Keycards nur in Dungeons, die einen Key benötigen)<br>- Sektion **Loot** überarbeitet |

# 

- Generierung

| Quest | Layouts | Level | Monstertyp |
| --- | --- | --- | --- |
| quest\_1 | \- dungeon\_2<br>\- dungeon\_4 | 1-5 | alle außer robot |
| quest\_2 | \- dungeon\_1<br>\- dungeon\_2<br>\- dungeon\_3<br>\- dungeon\_4<br>\-dungeon\_5 | 1-5 | alle außer robot |
| quest\_3 | \- dungeon\_4<br>\- cave\_1<br>\- cave\_2<br>\- cave\_3 | 1-5 | beast oder plant |
| quest\_4 | \- dungeon\_1<br>\- dungeon\_2<br>\- dungeon\_3<br>\- dungeon\_4<br>\- dungeon\_5 | 1-5 | alle außer robot |
| quest\_5 | \- dungeon\_1<br>\- dungeon\_2<br>\- dungeon\_3<br>\- dungeon\_4<br>\- dungeon\_5<br>\- cave\_1<br>\- cave\_2<br>\- cave\_3 | 1-5 | alle außer robot |
| quest\_6 | \- dungeon\_1<br>\- dungeon\_2<br>\- dungeon\_3<br>\- dungeon\_4<br>\- cave\_1<br>\- cave\_2<br>\- cave\_3<br>\- castle\_1 | 1-5<br>(castle nur L2-4) | dungeon & cave: alle außer robot |
| quest\_7 | \- spaceship\_1 | 5 | nur robot |

# Quest Kontext (Story)

- Die Welt wurde von fortgeschrittenen humanoiden Wesen als Simulation kreiert.
- Sie wird durch ein unterirdischen Mutterschiff (Spaceship) gesteuert, dass durch die Pyramiden mit Keycard betreten werden kann
- Um das Spiel zu gewinnen, muss der Spieler
- Schlüssel sammeln, um Zutritt zu den Dungeons zu erhalten, die Key Cards erhalten, die ihm wiederum Eintritt in die Pyramiden/Spaceship geben
- Die schwarze Key Card erlangen. Diese erhält er von dem König, dem er 11 "Orbs of ultimate Power" übergeben hat
- Der finale Raum ("Bridge") enthält die Spaceship Console, durch die die Endsequenz gestartet wird. Sie funktioniert nur, wenn Life Support und Engines laufen UND die Party die schwarze Key Card besitzt. Dann wird die Endsequenz abgespielt

Der Spieler weiss von dem am Anfang nichts und entdeckt es erst nach und nach

# Dungeon-übergreifende Quests

## ue\_quest\_1 (Quatloo Münzen)

| Beschreibung | Alternative | Objekte |
| --- | --- | --- |
| \- Verteile Quatloo Münzen ("quest\_quatloo\_coin.png") In den Dungeons/Caves/Castles Level 1 bis level 3 (in Kisten/Fässern/Storage Equipment)<br>\- Insgesamt sollen 25 Münzen verteilt werden.<br>\- In einem zufälligen **Level 2 Dungeon** stelle Seth Squirm an die Tür zu einem Raum. Er erklärt dem Spieler, dass die Quatloo Münzen In den Maschinen gegen verbesserte Attribute eingetauscht werden können. Die Maschinen werden jeweils durch eine Statue dargestellt (pro Seed sind die Statuen identisch, also nur ID29 oder nur ID33 oder nur ID34).<br>\- Pro Attribut gibt es eine Statue (aber immer der gleiche Typ. Bei 7 Attributen 7x Statuen). Für 1 Münze kann man 3 Attributspunkte erhalten. Jede Statue erklärt welchen Attributspunkt sie verbessert.<br>\- Beispiel "The plaque at the statue reads: 'I am Deu'us' the master of power. For a coin I will improve your strength.'. Je nachdem, ob der Spieler Münzen hat: "There is a small slot, but you don't have any items, which fits inside." oder "The Quatloo coin you found, fits exactly into the slot. Which character shall put it in?". Auswahlmöglichkeiten sind die 4 Charaktere und "Abbrechen" | keine | Seth Squirm: ID90<br>Statuen: ID29, ID33, ID34 <br>Quatloo Münzen: quest\_quatloo\_coin |

## ue\_quest\_2 (Skull Miser)

| Beschreibung | Alternative | Objekte |
| --- | --- | --- |
| \- Der Skull Miser ist immer in der Startstadt zu finden.<br>\- Die zu sammelnden "silver skulls" können für jeweils 1000 XP (pro Charakter) + 1000 Gold (für die Gruppe) einzeln abgeben werden (wenn ein Spieler mehr im Inventar hat werden alle direkt umgewandelt).<br>\- Das Quest ist erfüllt wenn der Spieler den 5. Schädel abgibt. Dafür gibt es als Bonus einen zufälligen L2 Ring (s. Generierungslogik für Ringe, z.B. beim Schmied).<br>\- Auch danach können weitere Schädel abgegben werden (es gibt allerdings keine weiteren Ringe). Die Skulls sind in L1 Dungeons/Caves versteckt.<br>\- Es gibt immer 15 Schädel in der Welt, unabhängig von ihrer Größe | keine | Skull Miser: ID82<br>Silver Skull: quest\_silver\_skull |

## ue\_quest\_3 (Orbs of Ultimate Power)

| Beschreibung | Alternative | Objekte |
| --- | --- | --- |
| \- Verteile in der Welt 31 "Orbs of Ultimate Power"<br>\- Diese finden sich ausschliesslich in L5 Endräumen (23) und in Spaceship Leveln (8: 2 je Sektion, außer in der Bridge)<br>\- Die 3 Könige versuchen jeweils 11 Kugeln zu erhalten, da sie dadurch die Übermacht erhalten und die anderen beiden Könige zerstören können<br>\- Der Spieler kann die "Orbs of Ultimate Power" den Königen retournieren. Es werden immer alle im Inventar befindlichen Orbs abgeben.<br>\- Pro Orb erhält die Party 1 mio Gold und jeder Charakter 1 mio XP<br>\- Sobald 1 König die 11 Kugel erhält, werden die anderen beiden Burgen zerstört und können nicht mehr betreten werden. Der König übergibt dem Spieler dann die schwarze Key Card.<br>\- Auch wenn ein König gewonnen hat können weiterhin Orbs bei ihm abgegeben werden. | keine | Orbs of Ultimate Power: quest\_orb (Inventar) und ID109 (Objekt) |

## ue\_quest\_4 (Pirate Queen)

| Beschreibung | Alternative | Objekte |
| --- | --- | --- |
| Verteile 20 Perlen der Jugend und Schönheit in L3 & L4 Cave/Dungeons/Castles<br>Platziere das Piratenschiff in die Mitte des größten Ozean<br>Anders als normale Monster bewegt es sich, wenn es in Sichtweite ist (daher abhängig von den Grafikeinstellung) und es bewegt sich 3 Felder pro Zug (nur Wasser)<br>Sobald es neben der Party ist erscheint ein Dialog mit ihrem Profilbild, abhängig davon, ob die Party mind. 1 **Perle der Jungend und der Schönheit** besitzt<br>a) Party besitzt **keine** Perle: Die Party verliert das gesamte Gold, was sie bei sich hat (das in der Bank ist sicher). Dazu der Text: "You are being pulled up onto the pirate ship, where the pirate queen already awaits you. 'What have we here? Some land rats on the sea? You know the drill, get there gold and throw them back!". After they have robbed you blank, you find yourself back on your float while the pirate ship disappears at the horizon". Das Piratenschiff innerhalb von 0,5 sec ausfaden<br>b) Party besitzt mindestens eine Perle: Sie verliert alle Perlen erhält dafür aber 100'000 XP (pro Charakter) und 50'000 Gold (für die Gruppe) für jede entfernte Perle. Dazu der Text: "You are being pulled up onto the pirate ship, where the pirate queen already awaits you. 'What have we here? Some land rats on the sea? You know the drill, get there gold and throw them back!". While the pirates rummage through your belongings, she suddenly tells them to stop. Her face lightens up and even seems to get friendly, when she spots the Pearl of Youth and Beauty. 'Well, maybe you are useful after all. Bring me more of the pearls and I will reward you. But do not dare to show up empty handed.' She orders her men to bring you your gold and they leave you behind on your float. <line\_break>The party receives <gold\_amount> gold and <xp\_amount> experience." . Das Piratenschiff innerhalb von 0,5 sec ausfaden<br>**Wiederkehr (ab 1.4):** Nach der Begegnung (a oder b) taucht das Piratenschiff erst **1 Woche später** wieder auf (an seiner Ausgangsposition). Ist das Schiff außer Sichtweite der Party, wird es auf seine Ausgangsposition zurückgestellt.<br>**Bewegung (ab 1.4):** tiefes und flaches Wasser; die Begegnung gibt es nur, wenn die Party auf dem Floß steht | keine | Pirate Ship: tbd (use dummy)<br>Pearl of Youth and Beauty: quest\_pearl\_of\_youth (Inventar) |

# Dungeonspezifische Quests

## Goldene Regeln

Soweit nicht explizit im Quest erwähnt, gelten diese Regeln immer

- Alle Quest Objekte können hinter Türen/Gittern stehen, aber **nie** hinter einer versteckten Wand
- Endräume erscheinen im Spiel erst nach dem Lösen des Rätsels, damit verhindert wird, dass sich der Spieler vorher hereinteleportiert (vorher sind es Wände)
- Alle Monsterzahlen beziehen sich auf die "Default" Kartengröße und skalieren mit der Kartengröße (Small = 2/3, Default = 1, Large = 4/3, Huge = 5/3. **Wichtig** die XP pro Monster skalieren ebenfalls, so dass sie in der Summe gleich bleiben (z.B. Bei "Default" gibt ein Monster 100XP > small=150XP, large=75 XP, huge=60 XP)
- Wird der End-Raum durch Teleportation erreicht, platziere dort magische Runen (ID73), damit der Spieler wieder an den Anfange des Dungeons zurückkehren kann
- Werden in Quests Anforderungen beschrieben (z.B. quest\_1 benötigt eine 5x5 Fläche) müssen diese in das generierte Level integriert werden (auch wenn die Beispiel Layouts dieses nicht aufzeigen)

## quest\_1 (The Moaning Statues)

| Beschreibung | Alternative | Objekte |
| --- | --- | --- |
| 1\. Am Dungeon Eingang gibt es eine 3x3 Fläche (um diese Fläche **muss** jeweils mind. 1 Feld frei sein). Das Mittelfeld ist leer. Auf den anderen Feldern stehen zufällig Statuen (niemals jedoch die Lösung). <br>2\. Außerdem steht direkt am Eingang eine einzelne Statue, mit dem Text (in EN) "Erst wenn alle 4 Ecken stöhnen wird die Mitte den Weg freigeben"<br>3\. Verteile 12 Hebel im Dungeon. 8 davon sind an eine exakte Position der 3x3 (Außen-)Fläche verbunden. Werden sie betätigt schalten sie zwischen einer Statue und keiner Statue (leeres Feld um). Alle anderen Hebel verhalten sich gleich, sind aber Dummies (der Spieler muss es durch Ausprobieren herausfinden)<br>4\. Die Statuen stöhnen, wenn man an sie herantritt<br>5\. Ziel des Spielers ist es die Hebel so einzustellen, dass die 4 Ecken Statuen zeigen und die anderen 4 Felder leer sind. Sobald diese Einstellung aktiv ist, teleportiert die Mitte die Party in den End-Raum.<br>6\. So lange die Lösung nicht korrekt ist, passiert nichts, wenn man in die Mitte tritt | Anstatt den Ecken, kann auch eine 3er Linie einer Himmelsrichtung die Lösung sein  ("Erst wenn der Norden/Osten/Westen/Süden stöhnt wird die Mitte den Weg freigeben") - Texts in EN übersetzen | Statue: ID33 oder ID 29<br>Hebel: ID39 |

## quest\_2 (Direction of Faces)

| Beschreibung | Alternative | Objekte |
| --- | --- | --- |
| 1\. Verteile 5 Kelche im Dungeon<br>2\. In den Kelchen ist eine seltsame Flüssigkeit. Der Spieler wird gefragt, welcher Charakter den Kelch austrinken soll.<br>3\. Der Charakter hört in seinem Geist eine Zahl und eine Himmelsrichtung ("You hear 1-N in your mind, before everthing gets dark in front of your eyes".)<br>4\. Es gibt jede **Zahl 1-5** genau einmal. Himmelsrichtungen sind "N/E/W/S".<br>5\. Der Charakter erhält einen zufälligen Status je nach Dungeonlevel: L1/2: poisoned/diseased/insane/cursed. L3/4/5: petrified/dead/paralysed/rotten). Der Spieler muss Zauber/Tempel nutzen, um die Charaktere wieder zu heilen.<br>6\. Platziere am Ende des Dungeons 5 Köpfe in einer Reihe entlang einer Wand. Alle schauen von der Wand weg in den Raum. Verleihe den Statuen einen Extra Text zusätzlich zu 7, welche einen Hinweis auf die Zahl gibt (z.B. "I was the **first** king" oder "I was the **second** to discover Sha'an Island"')<br>7\. Wenn der Spieler interagiert, nenne die aktuelle Himmelsrichtung und die nächste, z.B. "The head/statue ist facing South. Would you like to turn it into the West direction?"<br>8\. Die Objekte auch grafisch mit dem SFX "stone\_move.mp3" in die entsprechende Richtung drehen<br>9\. Sind alle Köpfe in der richtigen Richtung spiele den Sound "stone\_move.mp3". Eine Wand in dem Raum verschwindet und gibt den End-Raum frei. | Der 5-stellige Himmelsrichtungs-Code wird pro generierter Welt zufällig erstellt | Kelche:<br>ID 86<br>Köpfe: ID95(statue) oder ID29(head) |

## quest\_3 (The gongs)

| Beschreibung | Alternative | Objekte |
| --- | --- | --- |
| Verteile 4 Gongs in den Ecken des Dungeons.<br>Wenn sich der Spieler entscheidet den Gong zu schlagen erscheinen 5-7 Monster im gleichen Raum wie der Gong. Nutze die Monster, die in dem aktuellen Dungeon verwendet werden.<br>Sobald der 4. Gong (bzw. 5. wenn Alternative genutzt wird) geschlagen wird erscheinen in der Mitte des Dungeons Runen, die zum End-Raum führen. | Nutze 5 anstatt 4 Gongs | Gong: ID118 Runen: ID73 |

## quest\_4 (Calculations)

| Beschreibung | Alternative | Objekte |
| --- | --- | --- |
| 1\. Verteile 5-8 Statuen plus End-Statue im Dungeon (je nach Dungeongröße)<br>2\. Jede Statue hat einen Namen und nennt eine Zahl und Hinweis auf die Rechenoption<br>3\. Wird bei der End-Statue die korrekte Zahl angegeben, öffnet sich der End-Raum<br>Beispiel (Texte in EN übersetzen):<br>\- Statue 1: "Auf der Tafel der Statue steht: 'Zu Ehren des Helden Gordak, der mit seinen 12 Kriegern in der Schlacht von Lumpuz fiel.'" > 12+1<br>\- Statue 2: "Auf der Tafel der Statue steht: 'Zu Ehren der Blaufinger Garnision, die 20 ihrer Krieger bei der Verteidigung der Burg Elfenstein verlor'" > 20<br>\- Statue n: "Auf der Tafel der Statue steht: 'Zu Ehren des Generals Waldemor, dessen Weitsicht 80 Kriegern das Leben rettete'" > 0<br>\- End-Statue: "Ihr hört eine dumpfe Stimme: 'Wie viele Krieger sind ehrenvoll gefallen?" Antwort: 33 (12+1+20)<br>\- Es können auch andere Rechenoperationen verwendet werden, wenn die Zahlen nicht zu groß werden (max 3-stellig). Außerdem sind Division und Multiplikation von der Reihenfolge abhängig ('(1+2)\*3' ist anders als '1+2\*3'). Daher muss dies absolut präzise aus dem Text hervorgehen. Alternativ limitiert auf Addition und Subtraktion | Verändere die Zahlen der Rechnung | Statue: ID28 oder ID34 oder ID95<br>End-Statue:<br>ID27 oder ID61 |

## quest\_5 (Endgegner)

| Beschreibung | Alternative | Objekte |
| --- | --- | --- |
| \- Es gibt eine dominante Monsterpopulation (60%) deren Boss man am Ende besiegen muss (immer genau 1 End-Boss)<br>\- Das Level für die Schwierigkeit leitet sich **immer** aus dem Level der Population ab (nie vom Endgegner selber.<br>\- Unter "Alternative" stehen die validen Population/Endgegner Monster IDs<br>\- Der Endgegner ist immer in der nähe des End-Raumes. **Es muss verhindert werden, dass der Spieler die Loot einsammeln kann, ohne den Endgegner zu bekämpfen**<br>\- Es ist auch legitim, dass sich der End-Raum erst öffnet, wenn der Endgegner besiegt ist | Cobra Fiend (ID10) > Cult Leader(ID81)<br>Cyclops (ID13) > Cyclops King (ID82)<br>Green Dragon (ID33) > Dragon Lord (ID83)<br>Evil Eye (ID23) > Eye Master (ID84)<br>Minotaur(ID45) > Minotaur King (ID85)<br>Priest of Moo(ID59) > Moo Master (ID86)<br>Mummy (ID47) > Mummy King (ID87)<br>Jouster(ID36) > Top Jouster (ID89)<br>Vampire(ID73) > Vampire King (ID90)<br>Moose Rat(ID46) > Rat Overlord<br>(ID91)<br>**Wichtig:** Falls es Abweichungen zu monster-sheet.json gibt, passt die JSON Datei mit diesen Informationen an | keine |

## quest\_6 (Riddle)

| Beschreibung | Alternative | Objekte |
| --- | --- | --- |
| \- Eine **Antwort** aus dem Rätselmaster wird zufällig gewählt (**die Frage zu dem Rätsel wird in diesem Fall komplett ignoriert**)<br>\- Es werden **nur Antworten mit 1 Wort gewählt** (3-6 Buchstaben lang)  (z.B. **nicht** Rätsel #14 mit der Antwort "death by axe")<br>\- **Wichtige Sonderregel:** Bei Schlössern wird immer ein Wort gewählt, dass 4 Buchstaben hat, da es immer genau 4 Statuen gibt<br>\- Verteile so viele Statuen im Dungeon, wie das Wort Buchstaben hat<br>\- Jeder dieser Statue gibt einen verschleierten Hinweis auf einen Buchtstaben. <br>\- Nahe des End-Raums wird eine weitere Statue platziert, um die Antwort einzugeben. Die richtige Antwort gibt den Raum frei. Es sind unendlich Antworten möglich<br>\- Beispiel "Boots" (Die Buchstaben sollen im Spiel nicht besonders markiert werden. Dieses ist nur zum besseren Verständnis dieses Beispiels)<br>\- Statue 1: "The first brother was called **B**en" (Hinweis 1. Buchstabe)<br>\- Statue 2: "The second brother was called **O**liver" (Hinweis 2. Buchstabe)<br>\- Statue 3: "The youngest brother was called **S**alomon" (Hinweis 5. Buchstabe)<br>\- Statue 4: "The forth brother's name was **T**heodor" (Hinweis 4. Buchstabe)<br>\- Statue 5: "The third brother was a twin of the second, so they gave him the **same name**" (Hinweis 3. Buchstabe)<br>\- Statue 6: "What did the father of the brothers produce and sell for living?" (Answer: "boots") | \- zufällige Antwort aus dem Rätselmaster<br>\- Variation des Beispiels, wie die Buchstaben erklärt werden | \- Statue: ID95, ID61, ID34, ID29, ID28, ID27<br>\- Im Spaceship gibt es kein quest\_6 (dort gilt quest\_7)<br>\- In Cave Leveln nur: ID95 oder ID33 |

## quest\_7 (Spaceship)

| Beschreibung | Alternative | Objekte |
| --- | --- | --- |
| \- Das Spaceship (=Eingang über die Pyramiden) hat immer 5 Sektionen mit den Namen: "Storage Bay", "Engine Room", "Life Support", "Control Room" und "Bridge" (diese Schreibweise gilt überall im Dokument)<br>\- **Pyramiden:** Welche Pyramide in welche Sektion führt, ist zufällig. Einzige Ausnahme: Die Pyramide zur "Bridge" steht auf einem schweren L5-Territory<br>\- **Alle Aktionen, Sounds und das Ambient Light betreffen immer das ganze Schiff** (alle 5 Sektionen), nicht nur die Sektion, in der sie ausgelöst werden<br>\- Anfangs ist die Beleuchtung dunkel (wie im Dungeon), allerdings in roter Farbe<br>\- **Orbs:** In jeder Sektion außer der "Bridge" liegen 2 Orbs of ultimate power (ID109), insgesamt 8<br>\- **Monster:** nur Robots. Die "Bridge" ist vor allem mit Terminatoren (ID69) gesichert. Diese dürfen auch in den anderen Sektionen vorkommen, allerdings nur rar<br>\- "Storage Bay" beinhaltet immer 10 futuristische Kisten. 8 davon enthalten Pillen oder ein Serum (2 geben 1 mio XP, 3 geben +15 Attributspunkte auf **ein** zufälliges Attribut (z.B. Glück +15), 3 geben +30 Resistenzpunkte auf **eine** zufällige Resistenz - immer nur für 1 Charakter, **den der Spieler auswählt**). Die Kiste gibt einen Hinweis auf die Verbesserung, ähnlich wie bei den Magic Pools, aber im Sci-Fi-Stil: nie wird das Attribut genannt, sondern ein Produktname, der pro Welt fest zu einem Attribut bzw. einer Resistenz gehört. Beispiel: "You find a package with a single pill inside it. The packaging reads 'Stamina-X1000.4'. Who wants to try the pill?" (> Endurance). Die letzten beiden Kisten erhalten jeweils 1 Power Crystal (Quest Item Inventar)<br>\- "Engine Room" beinhaltet 4 Power Crystals (3D Objekt) und 1 Broken Power Crystal. Die Power Crystals strahlen ein sehr schwaches Licht aus. **Ersetzen:** Hat die Party einen Power Crystal (Quest Item) im Inventar, fragt das kaputte Objekt: "The crystal in your inventory seems to have the same size like the broken one. Try to replace it?" (Ja/Nein). Bei Ja wird der Kristall **verbraucht** und das Modell wechselt von kaputt zu intakt. Ohne Kristall im Inventar (Vorschlag): "The crystal is broken. Maybe an intact one of the same size could replace it." Nach dem Ersetzen leuchten alle 5 Power Crystals stark (3 Felder Radius - Blauton, wie Kristall): "As soon as you snap in the new crystal its start to emit a faint light, which grows quickly brighter. You realize that also all other crystals start to emit a strong light, while a humming noise appears"<br>\- "Life Support" hat die gleiche Logik wie "Engine Room" (4 Power Crystals + 1 Broken Power Crystal, der Ersatz kommt aus der Storage Bay) mit dem Unterschied, dass beim Reparieren des Kristalls der Sound "light\_on.mp3" einmalig ertönt und gleichzeitig (= Länge des Sounds, 1,44 s) die Beleuchtung **im ganzen Schiff** von dunkel-rot auf Tages-hell wechselt (und nicht mehr rot)<br>\- "Control Room" enthält 1 Computer (ID68), der anfangs den Status hat "<br>Ship status:<br>Life support: Emergency only<br>Engines: Failure<br>" Wird "Life Support" repariert, ändert sich die Anzeige auf 'Life Support: Functional'. Wird "Engine Room" repariert, ändert sich der Punkt auf "Engines: Functional'". Wenn beide 'functional' sind, erscheint zusätzlich die Frage: 'Would you like to activate the engines?'. Bejaht der Spieler dies, spiele **im ganzen Schiff** "low-engine-hum.mp3" zusätzlich zur Musik ab. Der Sound läuft **permanent, aber nur innerhalb des Schiffs** (auch nach Speichern/Laden und beim Wechsel der Sektion). Die Lautstärke ist so gesetzt, dass er durch die Hintergrundmusik hörbar ist, diese aber nicht übertönt (erste Version: Stufe 0,35 der Effektlautstärke, ca. 7 dB unter der Musik; Feedback folgt). Die Engine Anzeige ändert sich auf 'Engines: Ready'. Dies ist der Endzustand, es gibt keine Fragen mehr<br>\- Der "Control Room" enthält zusätzliche Computer (ID68), die die Antworten der Mini Quests geben. Die Weltgenerierung setzt die Miniquests, aus ihnen entsteht die Liste: es kommen alle Level L1-L5 vor, sofern sie ein Miniquest haben. **Pro Level 1 Computer** (mehr, wenn die Liste des Levels nicht auf eine Seite passt). Der Titel ist immer "Code words for surface entities" und darunter die Liste der Orte des Levels z.B. "Cave of Alma: 'fire', 'fear'". Evaluiere selbst, wie viele Passwörter auf eine Seite passen. Wichtig: auch bei riesigen Welten muss jeder Computer erreichbar sein - ggf. Sektionsgröße anpassen, wenn nötig<br>\- **Computer zeigen ihren Text auf dem ComputerScreen** (Bildschirmrahmen statt Schriftrolle, `ui/computer_screen.webp`, `UI.computerMessage`). Das gilt für alle Computer (ID68), auch den Status-Computer<br>\- Die "Bridge" enthält die Spaceship Console, durch die die Schlusssequenz gestartet wird. Diese steht zentral im Raum und soll beleuchtet sein. Sie kann nur benutzt werden, wenn **Life Support und Engines laufen** (Anzeige 'Life Support: Functional' und 'Engines: Ready') **UND die Party die schwarze Key Card besitzt**. Sonst den "Denied" Sound spielen. Fehlt es an Life Support/Engines: "Ship not fully operational". Fehlt nur die Karte (Vorschlag): "A slot beside the screen glows red. The console wants a black key card." | keine | **Modelle** (Nutzerdateien, `tools/assets/sources/models`):<br>\- Futuristic Box: Modell `obj_futuristic_box` (`Futuristic_Box.glb`, kein Altitem, daher keine Item-ID)<br>\- Power Crystal (Inventar): Quest-Item `quest_power_crystal` (Bild `quest_power_crystal.png`)<br>\- Power Crystal (3D-Objekt): ID67 (`Power_crystal.glb` ersetzt das Altmodell, gleiche Maße)<br>\- Broken Power Crystal: Modell `obj_power_crystal_broken` (`Power_crystal_broken.glb`, kein Altitem)<br>\- Computer: ID68 (Computer terminal), Anzeige: ComputerScreen (`ui/computer_screen.webp`, Quelle `tools/assets/sources/ui/computer_screen.png`)<br>\- Space Ship Console: Modell `obj_spaceship_console` (`Spaceship_Console.glb`, kein Altitem)<br>\- Orb of ultimate power: ID109, Quest-Item `quest_orb`<br>\- Terminator: Monster ID69<br>\- Transporter Tube: ID40<br>**Sounds:**<br>\- `light_on.mp3`: Sound-ID 9055 (`light_on`, 1,44 s)<br>\- `low-engine-hum.mp3`: Sound-ID 9 (`low_engine_hum`, 27,5 s, Hintergrund-Schleife wie die Sounds 1 bis 8, Stufe 0,35 in `ENGINE_HUM_LEVEL`)<br>\- "Denied": Sound-ID 9014 (`denied`)<br>**Zustand:** Flag `ship:engines` in `state.opened` (Engines laufen, `ENGINES_FLAG`) |

## Miniquest - Extra Loot

- Statuen oder Kristalle können genutzt werden, um 0-4 Zusatzrätsel in Level einzubauen
- Diese Miniquests sind unabhängig vom Main Quest
- Nutze dazu den "Rätselmaster" - pro Welt darf jedes Rätsel nur max. 1x vorkommen
- Wähle zwischen 2 Optionen:
- leicht (x1): die Statue unendlich viele Antworten zu
- schwer (x2): die Statue lässt max. 3 Antworten zu (nach der 3. Antwort schweigt sie)
- Wähle zwischen 3 Optionen: Wird die Frage falsch beantwortet, passiert entweder:
- leicht (x1): nichts
- mittel (x2): die Party wird wegteleportiert
- schwer (x3): die Party wird auf ein Fallenfeld wegteleportiert
- Wird die Frage richtig beantwortet gibt es Loot. Diese richtet sich nach der Schwierigkeit: die Basisloot ist das doppelte der normalen Loot. Dieser Wert wird mit der Schwierigkeit multipliziert. D.h. bei einem schwer/schwer Miniquest wird die Basis Loot mit x6 (2x3) multipliziert und hat daher den 12fachen Wert der normalen Loot

## Rätselmaster

- Sämtliche Antworten **die in der Welt existieren** können je nach Level als Gerücht in den Tavernen erscheinen (d.h. es müssen alle im Pool der Möglichkeiten sein, es sind neben den Antworten aber auch lustige Antworten dabei) . D.h. neben den lustigen Anekdoten (ohne Info Gehalt), können Aussagen wie "You invite a grieving peasant for a beer. He mumbles 'My father told me on his death bed the word . I have no clue what it means, but it must be important.'. vorkommen

### Liste der Rätsel

**Wichtig:** Du hattest in deiner Analyse folgendes herausgefunden "24 von 300 Antworten sind kein Wort, 61 Antworten kommen mehrfach vor, 3 Rätsel sind kaputt → 6". > Bitte korrigiere, lösche oder ersetze diese (es sollen am Ende 250-300 Rätsel sein)

1: {"question": "It has a golden head. It has a golden tail. It has no body.", "answer": "gold coin"}, 2: {"question": "It wears a leather coat to keep its skins in working order. Escorts you to other realms, without a magic portal.", "answer": "book"}, 3: {"question": "It dampens as it dries.", "answer": "towel"}, 4: {"question": "What has two hands on its face but no arms?", "answer": "clock"}, 5: {"question": "What kind of coat is always wet when you put it on?", "answer": "paint"}, 6: {"question": "Many have heard me, yet nobody has seen me. I won’t speak back unless spoken to.", "answer": "echo"}, 7: {"question": "What five long word become shorter when you add two letters?", "answer": "short"}, 8: {"question": "What is not alive but grows, does not breathe but needs air?", "answer": "fire"}, 9: {"question": "Better old than young; the healthier it is, the smaller it will be.", "answer": "wound"}, 10: {"question": "This fire is smothered best not by water or sand but by words.", "answer": "desire"}, 11: {"question": "Two friends stand and travel together, one nearly useless without the other.", "answer": "boots"}, 12: {"question": "Feed me and I will live, give me a drink and I will die.", "answer": "fire"}, 13: {"question": "A curved stick and a straight twig means red sap and a snapped trunk.", "answer": "death by arrow"}, 14: {"question": "No warning of Timber could have stopped the dropping petals.", "answer": "death by axe"}, 15: {"question": "A fitting cravat for a poorly chosen suit.", "answer": "death by hanging"}, 16: {"question": "I build castles, yet tear down mountains, make some men blind, and others see. What am I?", "answer": "sand"}, 17: {"question": "As I was going to St Ives I met a man with 7 wives. Each wife had 7 kids. Each kid had 7 cats. Each cat had 7 kittens. How many were going to St Ives?", "answer": "one"}, 18: {"question": "What do banana, grammar and assess all have in common? Answer: if you take the first letter and put it on the end of the word, reading it backwards they spell the same word.", "answer": "?"}, 19: {"question": "Twelve men walking by, twelve pears hanging high. Each took a pear and left eleven hanging there. How did it happen?", "answer": "names"}, 20: {"question": "River bridge crossing, look out for the guards. Can you spell that without any ‘R’s?", "answer": "that"}, 21: {"question": "What is it that you keep when you need it not, but throw out when you do need it?", "answer": "anchor"}, 22: {"question": "The foolish man wastes me, The average man spends me, And wise man invests me, Yet all men succumb to me. What am I?", "answer": "time"}, 23: {"question": "What is something that dawns on you even when it shouldn’t?", "answer": "obvious"}, 24: {"question": "I start out wonderful, but then begin worse. What am I?", "answer": "w"}, 25: {"question": "What has four legs in the morning, two legs in the afternoon and three legs in the evening?", "answer": "man"}, 26: {"question": "I’m made out of five letters, And I’m made out of seven letters; I have keys but I don’t have locks, I’m concerned with time, but not with clocks.", "answer": "piano"}, 27: {"question": "Forty white horses on a red hill. They champ, they stamp, and then stand still.", "answer": "teeth"}, 28: {"question": "I can fly like a bird not in the sky, which can always swim and can always dry. I say goodbye at night and morning hi. I’m part of you what am I. I follow and lead as you pass, dress yourself in black my darkness lasts. I flee the light but without the sun, Your view of me would be gone.", "answer": "shadow"}, 29: {"question": "I am what men love more than life, fear more than death or mortal strife, what dead men have and rich require. I’m what contented men desire.", "answer": "nothing"}, 30: {"question": "Two men drink poisoned Iced Tea. One man drinks his fast and lives. The other man drinks his slow and dies. How is this possible?", "answer": "ice"}, 31: {"question": "Towns without houses, forests without trees, mountains without boulders and waterless seas.", "answer": "map"}, 32: {"question": "Two bodies in one, the longer I stand, the faster I run.", "answer": "hourglass"}, 33: {"question": "Men desire me in public, but fear me in private.", "answer": "truth"}, 34: {"question": "What is so fragile, even speaking its name will break it?", "answer": "silence"}, 35: {"question": "What must you first give to me in order to keep it?", "answer": "word"}, 36: {"question": "Though I’m tender, I’m not to be eaten, Nor -- though, mint fresh -- your breath to sweeten.", "answer": "money"}, 37: {"question": "You never see it, but it’s almost always there, and most people quickly notice when it’s absent.", "answer": "air"}, 38: {"question": "An untiring servant it is, carrying loads across muddy earth. But one thing that cannot be forced, is a return to the place of its birth.", "answer": "river"}, 39: {"question": "Blessed are the first. Slow are the second. Playful are the third. Bold are the fourth. Brave are the fifth.", "answer": "blade"}, 40: {"question": "Brought to the table. Cut and served. Never eaten.", "answer": "cards"}, 41: {"question": "It can pierce the best armor, And make swords crumble with a rub. Yet for all its power, It can’t harm a club.", "answer": "rust"}, 42: {"question": "It is a journey whose path depends, on an other’s vision of where it ends.", "answer": "book"}, 43: {"question": "Men seize it from its home, tear apart its flesh, drink the sweet blood, then cast its skin aside.", "answer": "orange"}, 44: {"question": "Names give power, Magic to control. But what is broken, by naming it?", "answer": "silence"}, 45: {"question": "Passed from father to son, And shared between brothers. Its importance is unquestioned, Though it is used more by others.", "answer": "name"}, 46: {"question": "Today he is there to trip you up, And he will torture you tomorrow. Yet he is also there to ease the pain, When you are lost in grief and sorrow.", "answer": "alcohol"}, 47: {"question": "In the form of fork or sheet, I hit the ground. And if you wait a heartbeat, You can hear my roaring sound.", "answer": "lightning"}, 48: {"question": "I have no tears but I perspire, I stretch but cannot respire, I can jump, walk, run and dance, Though I have no mind. I’ll take a stance. What am I?", "answer": "leg"}, 49: {"question": "The beast of the plains, it goes through the ground, constantly on the search for its next meal. While it hates the taste of dwarves and elves, it loves the taste of halfling.", "answer": "bulette"}, 50: {"question": "This thing can stay completely hidden in even the broadest of daylight. In halls and rooms that monster waits to ambush its next victim. Watch out from below, because it is the floor that this thing waits.", "answer": "rugo f smothering"}, 51: {"question": "In the world below, almost everything below has a heart as dark as their surroundings. This thing is the one exception, giving a light glow in the world of the Underdark.", "answer": "flumph"}, 52: {"question": "You keep it, but it never ages. Once shared it is gone forever.", "answer": "secret"}, 53: {"question": "I can bring down the mightiest of men. Nobody can defy me. I am the enemy of flight. Yet you can’t even sense my presence.", "answer": "gravity"}, 54: {"question": "The more you walk on me the more we get along, and while other may still use me, with you is where I belong.", "answer": "shoes"}, 55: {"question": "I give mirth and merriment and they say I smell quite old but I can turn a timid man into one that is quite bold.", "answer": "wine"}, 56: {"question": "I am green with envy when I am placed below the sky. I do not breathe the air you breathe but I never wonder why. If you go and shelter me, I simply shrink and die. The answer to this riddle is simply who am I?", "answer": "plant"}, 57: {"question": "I guard precious treasures and yet my body never moves, but I open like a book when something of yours is used. When finally I’m gutted always feel quite blue. I always feel so useless without the gold that I consume.", "answer": "treasure chest"}, 58: {"question": "My body’s thin and slender and I grow shorter every day. You can use my single purpose, and I’ll be sure to lead the way. When I am placed upon a pastry then my life is soon to fade.", "answer": "candle"}, 59: {"question": "I am what’s desired above of all fame and wealth. Without me it’s assured that you’ll begin to lose your health. I’m not a fluid dancer, but you can put me on a shelf.", "answer": "food"}, 60: {"question": "I give people purpose, I am the gardener pulling weeds. In fact I keep a watchful eye over everybody’s deeds. I am the cobbler making shoes I am the blacksmith shoeing steeds.", "answer": "job"}, 61: {"question": "Born by fire, stone, or rain I feel most comfortable at home on the planes. When I am out of my element, I feel much disarray.", "answer": "elemental"}, 62: {"question": "I am gifted to you only when I am unwanted. I have the power to kill kings or the lowliest paupers. My strength is unquestioned and I move far and wide, yet my power can falter from potions imbibed.", "answer": "sickness"}, 63: {"question": "The more you take out the bigger I get. What am I?", "answer": "hole"}, 64: {"question": "I am green for some time, but blue thereafter. If it is dark, I am likely to eat you.", "answer": "grue"}, 65: {"question": "Up and down they go and travel, but never do they move an inch.", "answer": "stairs"}, 66: {"question": "8 \_ \_ \_ 1 \_ \_ \_ 2 0’,Answer: 549763 (Put all the numbers in alphabetical order)", "answer": "549763"}, 67: {"question": "Halo of water, tongue of wood, skin of stone and long I’ve stood. My fingers short reach to the sky, inside my heart men live and die. What am I?", "answer": "castle"}, 68: {"question": "Flying on invisible wings. I am massive in size. Then if my master commands, I am as small as he wishes. All men wish to own me, but when I touch them, They cannot touch me. I cry when I am with my brothers. Darkness follows wherever I go. I’m a friend, I’m an enemy. I am freedom.", "answer": "cloud"}, 69: {"question": "A face I do have, but see I do not. When they see my hands, they oft ponder in thought,what am I?", "answer": "watch"}, 70: {"question": "The more you take, the more you leave behind. What am I?", "answer": "footsteps"}, 71: {"question": "What kind of room can you never enter?", "answer": "mushroom"}, 72: {"question": "What is long, brown, and sticky?", "answer": "stick"}, 73: {"question": "What has a head and a tail, can flip but has no legs?", "answer": "coin"}, 74: {"question": "What is black when you buy it, red when you use it, and white when you throw it away?", "answer": "coal"}, 75: {"question": "What belongs to you, but other people use it more than you do?", "answer": "name"}, 76: {"question": "Tall I am young, Short I am old, While with life I glow, Wind is my foe. What am I?", "answer": "candle"}, 77: {"question": "I can build castles, I can stop a flood, I can show the time flow, I can make people blind, I can make others see. What am I?", "answer": "sand"}, 78: {"question": "If I’m in front I don’t matter, If I’m in back I make everything be more, I am something yet I am nothing.", "answer": "zero"}, 79: {"question": "I shine brightest in the dark. I am there but cannot be seen. To have me costs you nothing. To be without me costs you everything.", "answer": "hope"}, 80: {"question": "I am taken from a mine, and shut up in a wooden case, from which I am never released, and yet I am used by almost everybody.", "answer": "pencil lead"}, 81: {"question": "What goes round the house and in the house but never touches the house?", "answer": "sun"}, 82: {"question": "What comes once in a minute, twice in a moment, but never in a thousand years?", "answer": "m"}, 83: {"question": "He who has it doesn’t tell it. He who takes it doesn’t know it. He who knows it doesn’t want it. What is it?", "answer": "counterfeit money"}, 84: {"question": "What goes round and round the wood but never goes into the wood?", "answer": "bark"}, 85: {"question": "I have a little house in which I live all alone. It has no doors or windows, and if I want to go out I must break through the wall.", "answer": "chick"}, 86: {"question": "There are four siblings in this world, all born together. The first runs and never wearies. The second eats and is never full. The third drinks and is always thirsty. The fourth sings a song forever.", "answer": "water fire earth wind"}, 87: {"question": "A cloud was my mother, the wind is my father, my son is the cool stream, and my daughter is the fruit of the land. A rainbow is my bed, the earth my final resting place, what am I?", "answer": "rain"}, 88: {"question": "Poke your fingers in my eyes and I will open wide my jaws. Linen cloth, quills or paper, all will split before my might. What am I?", "answer": "shears"}, 89: {"question": "What goes with a carriage, comes with a carriage, is of no use to a carriage and yet the carriage cannot go without it?", "answer": "noise"}, 90: {"question": "What stands on one leg with its heart in its head?", "answer": "cabbage"}, 91: {"question": "It’s been around for millions of years, but it’s no more than a month old. What is it?", "answer": "moon"}, 92: {"question": "I met a man with a load of wood which was neither straight nor crooked. What kind of wood was it?", "answer": "sawdust"}, 93: {"question": "What binds two people yet touches only one?", "answer": "wedding ring"}, 94: {"question": "I am the beginning of sorrow and the end of sickness. There’s no happiness without me nor is there sadness. I am always in risk, yet never in danger. You will find me in the sun, but I am never out of darkness.", "answer": "s"}, 95: {"question": "What holds water yet is full of holes?", "answer": "sponge"}, 96: {"question": "Lives without a body, hears without ears, speaks without a mouth, to which the air alone gives birth.", "answer": "echo"}, 97: {"question": "What goes into the water red and comes out black?", "answer": "poker"}, 98: {"question": "When one does not know what it is, then it is something. When one knows what it is, then it is nothing.", "answer": "riddle"}, 99: {"question": "It is the beginning of eternity, the end of time and space, the beginning of the end and the end of every space. What is it?", "answer": "e"}, 100: {"question": "What tastes better than it smells?", "answer": "tongue"}, 101: {"question": "What always follows night but never leads it?", "answer": "day"}, 102: {"question": "What has roots nobody sees, is taller than trees, up, up it goes, and yet never grows?", "answer": "mountain"}, 103: {"question": "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?", "answer": "echo"}, 104: {"question": "What can travel around the world while staying in a corner?", "answer": "stamp"}, 105: {"question": "What gets wetter as it dries?", "answer": "towel"}, 106: {"question": "What has a heart that doesn’t beat?", "answer": "artichoke"}, 107: {"question": "What begins with T, ends with T, and has T in it?", "answer": "teapot"}, 108: {"question": "What runs all around a backyard, yet never moves?", "answer": "fence"}, 109: {"question": "What has many keys but can’t open a single lock?", "answer": "piano"}, 110: {"question": "What can you hold in your left hand but not in your right?", "answer": "right elbow"}, 111: {"question": "What has one eye, but can’t see?", "answer": "needle"}, 112: {"question": "What is so delicate that saying its name breaks it?", "answer": "silence"}, 113: {"question": "What gets bigger as you take away from it?", "answer": "hole"}, 114: {"question": "What has an end but no beginning, a home but no family, a space without a room?", "answer": "circle"}, 115: {"question": "What occurs once in every minute, twice in every moment, yet never in a thousand years?", "answer": "m"}, 116: {"question": "What has a head and a tail, is brown, has no legs?", "answer": "penny"}, 117: {"question": "What can you break, even if you never pick it up or touch it?", "answer": "promise"}, 118: {"question": "What is full of holes but still holds water?", "answer": "sponge"}, 119: {"question": "What question can you never answer yes to?", "answer": "are you asleep"}, 120: {"question": "What can you catch but not throw?", "answer": "cold"}, 121: {"question": "What has cities, but no houses; forests, but no trees; and water, but no fish?", "answer": "map"}, 122: {"question": "What kind of tree can you carry in your hand?", "answer": "palm"}, 123: {"question": "What comes once in a year, twice in a week, but never in a day?", "answer": "letter e"}, 124: {"question": "What has many teeth, but can’t bite?", "answer": "comb"}, 125: {"question": "What kind of band never plays music?", "answer": "rubber band"}, 126: {"question": "What goes up but never comes down?", "answer": "age"}, 127: {"question": "What can you catch but not see?", "answer": "cold"}, 128: {"question": "What has a neck but no head?", "answer": "bottle"}, 129: {"question": "What gets broken without being held?", "answer": "promise"}, 130: {"question": "What has four wheels and flies?", "answer": "garbage truck"}, 131: {"question": "What can fill a room but takes up no space?", "answer": "light"}, 132: {"question": "What can you keep after giving it to someone?", "answer": "word"}, 133: {"question": "What has keys but can’t open locks?", "answer": "keyboard"}, 134: {"question": "What belongs to you but is used more by others?", "answer": "name"}, 135: {"question": "What has a bottom at the top?", "answer": "leg"}, 136: {"question": "What travels around the world but stays in one spot?", "answer": "stamp"}, 137: {"question": "What has a head, a tail, but no body?", "answer": "coin"}, 138: {"question": "What has to be broken before you can use it?", "answer": "egg"}, 139: {"question": "What goes through a door but never enters?", "answer": "keyhole"}, 140: {"question": "What has an eye but cannot see?", "answer": "needle"}, 141: {"question": "What has many hearts but no other organs?", "answer": "deck of cards"}, 142: {"question": "What has to be swallowed before you can use it?", "answer": "pill"}, 143: {"question": "What runs but never walks, has a mouth but never talks?", "answer": "river"}, 144: {"question": "What can you serve but never eat?", "answer": "tennis ball"}, 145: {"question": "What has one voice, many tongues, and an echo in caves?", "answer": "echo"}, 146: {"question": "What’s always coming, but never arrives?", "answer": "tomorrow"}, 147: {"question": "What stays where it is when the whole world moves around it?", "answer": "sun"}, 148: {"question": "What can you break even if you never touch it?", "answer": "promise"}, 149: {"question": "What has words but never speaks?", "answer": "book"}, 150: {"question": "What begins with an E, ends with an E, but only contains one letter?", "answer": "envelope"}, 151: {"question": "What kind of room has no doors or windows?", "answer": "mushroom"}, 152: {"question": "What is pierced before you use it?", "answer": "earring"}, 153: {"question": "What has a head, a tail, but no legs?", "answer": "coin"}, 154: {"question": "What belongs to you but others use it more than you do?", "answer": "name"}, 155: {"question": "What has holes but still holds water?", "answer": "sponge"}, 156: {"question": "What has a ring but no finger?", "answer": "telephone"}, 157: {"question": "What can you open but can’t close once opened?", "answer": "egg"}, 158: {"question": "What has a spine but no bones?", "answer": "book"}, 159: {"question": "What has keys but can’t open locks?", "answer": "piano"}, 160: {"question": "What has lakes with no water, mountains with no stone, and cities with no buildings?", "answer": "map"}, 161: {"question": "What can be heard but never seen and only speaks when spoken to?", "answer": "echo"}, 162: {"question": "What is always in front of you but can’t be seen?", "answer": "future"}, 163: {"question": "What gets sharper the more you use it?", "answer": "brain"}, 164: {"question": "What is made of water but if you put it into water it dies?", "answer": "ice"}, 165: {"question": "What beast walks on four legs in the morning, two at noon, and three in the evening?", "answer": "man"}, 166: {"question": "What can’t talk but will reply when spoken to?", "answer": "echo"}, 167: {"question": "What can travel the world while staying in its corner?", "answer": "stamp"}, 168: {"question": "What comes down but never goes up?", "answer": "rain"}, 169: {"question": "What begins and ends with T, is full of T and has T in it?", "answer": "teapot"}, 170: {"question": "What has one eye and a thousand legs?", "answer": "hurricane"}, 171: {"question": "What can't be seen but can fill a room?", "answer": "darkness"}, 172: {"question": "What runs around the whole yard without moving?", "answer": "fence"}, 173: {"question": "What has no beginning, end or middle?", "answer": "doughnut"}, 174: {"question": "What goes up when the rain comes down?", "answer": "umbrella"}, 175: {"question": "What has cities but no houses, forests but no trees?", "answer": "map"}, 176: {"question": "What has to be driven but has no wheels?", "answer": "nail"}, 177: {"question": "What always runs but never walks, often murmurs, never talks, has a bed but never sleeps?", "answer": "river"}, 178: {"question": "What is cut on a table, but never eaten?", "answer": "deck of cards"}, 179: {"question": "What has thirteen hearts but no other organs?", "answer": "deck of cards"}, 180: {"question": "What can fly without wings?", "answer": "time"}, 181: {"question": "What has words written yet cannot speak?", "answer": "book"}, 182: {"question": "What is black when you see it and white when you touch it?", "answer": "chalkboard"}, 183: {"question": "What can fill entire rooms without taking up space?", "answer": "light"}, 184: {"question": "What moves without wings, strikes without hands, leaves without trace?", "answer": "wind"}, 185: {"question": "What is always in front of you but can’t be seen?", "answer": "future"}, 186: {"question": "What tastes better than it smells?", "answer": "tongue"}, 187: {"question": "What is full of keys but cannot open locks?", "answer": "keyboard"}, 188: {"question": "What has many rings but no fingers?", "answer": "telephone"}, 189: {"question": "What breaks yet never falls, and what falls yet never breaks?", "answer": "day/night"}, 190: {"question": "What flies forever, rests never?", "answer": "wind"}, 191: {"question": "What runs but never walks, has a bed but never sleeps?", "answer": "river"}, 192: {"question": "What has a bark but no bite?", "answer": "tree"}, 193: {"question": "What can you catch but not throw?", "answer": "cold"}, 194: {"question": "What has hands but cannot clap?", "answer": "clock"}, 195: {"question": "What grows when you feed it but dies when you give it a drink?", "answer": "fire"}, 196: {"question": "What goes up and down but stays in the same place?", "answer": "stairs"}, 197: {"question": "What comes once in a minute, twice in a moment, but never in a thousand years?", "answer": "m"}, 198: {"question": "What has two feet but no legs?", "answer": "ruler"}, 199: {"question": "What can you keep but cannot share unless you give it away?", "answer": "secret"}, 200: {"question": "What is always coming yet never arrives?", "answer": "tomorrow"}, 201: {"question": "I have no voice, yet I speak to you. I tell of things that happened too. I have no ears, yet I hear your cry. What am I?", "answer": "book"}, 202: {"question": "I am not alive, but I grow. I don’t have lungs, but I need air. I don’t have a mouth, but water kills me.", "answer": "fire"}, 203: {"question": "I am always hungry, I must always be fed. The finger I touch, will soon turn red.", "answer": "flame"}, 204: {"question": "I have a bed but never sleep. I run but never walk. I have a mouth but never talk.", "answer": "river"}, 205: {"question": "I am taken from a mine, and shut in a wooden case. I am used by many, yet never released.", "answer": "pencil lead"}, 206: {"question": "I am not a bird, but I can fly through the sky. I am not a river, but I can run through land.", "answer": "arrow"}, 207: {"question": "I am the beginning of the end, and the end of time and space. I am essential to creation, and I surround every place.", "answer": "e"}, 208: {"question": "I am a box without hinges, key, or lid, yet golden treasure inside is hid.", "answer": "egg"}, 209: {"question": "I am tall when I’m young, and short when I’m old. I glow with life, but wind is my foe.", "answer": "candle"}, 210: {"question": "I am not alive, but I can die. I am not a person, but I can cry.", "answer": "cloud"}, 211: {"question": "I am invisible, yet you feel me. I move things without touching them.", "answer": "wind"}, 212: {"question": "I am a path that can’t be walked, a line that can’t be crossed.", "answer": "horizon"}, 213: {"question": "I am a mirror to the sky, yet I live below. I reflect the stars, but I am not one.", "answer": "lake"}, 214: {"question": "I am a place without doors, a room without walls. I hold secrets and dreams.", "answer": "mind"}, 215: {"question": "I am a whisper in the dark, a flicker in the night. I vanish with the dawn.", "answer": "shadow"}, 216: {"question": "I am a tale told without words, a journey without steps.", "answer": "dream"}, 217: {"question": "I am a cloak that hides the world, yet I reveal the stars.", "answer": "night"}, 218: {"question": "I am a key that opens no lock, a tune with no sound.", "answer": "password"}, 219: {"question": "I am a crown with no king, a throne with no ruler.", "answer": "mountain"}, 220: {"question": "I am a sword that cuts without steel, a wound that leaves no scar.", "answer": "word"}, 221: {"question": "I am a ladder that reaches the sky, yet I never touch it.", "answer": "tree"}, 222: {"question": "I am a ring with no beginning or end, worn by none, yet seen by all.", "answer": "sun"}, 223: {"question": "I am a traveler with no feet, a messenger with no voice.", "answer": "light"}, 224: {"question": "I am a bridge that connects nothing, a span that holds no weight.", "answer": "rainbow"}, 225: {"question": "I am a guest in every home, yet I belong to none.", "answer": "time"}, 226: {"question": "I am a thief that takes without hands, a bandit that leaves no trace.", "answer": "sleep"}, 227: {"question": "I am a hunter with no prey, a predator with no teeth.", "answer": "trap"}, 228: {"question": "I am a lock that opens with silence, a door that leads to thought.", "answer": "book"}, 229: {"question": "I am a flame that never burns, a light that never fades.", "answer": "hope"}, 230: {"question": "I am a song that never ends, a rhythm without beat.", "answer": "life"}, 231: {"question": "I am a shield that protects from nothing, yet all fear me.", "answer": "death"}, 232: {"question": "I am a whisper that shouts, a silence that speaks.", "answer": "memory"}, 233: {"question": "I am a puzzle with no pieces, a game with no rules.", "answer": "riddle"}, 234: {"question": "I am a road with no destination, a path with no direction.", "answer": "maze"}, 235: {"question": "I am a coin with no value, a treasure with no worth.", "answer": "fool’s gold"}, 236: {"question": "I am a mask that reveals, a disguise that shows truth.", "answer": "mirror"}, 237: {"question": "I am a storm without rain, a cloud without sky.", "answer": "emotion"}, 238: {"question": "I am a dance without music, a movement without motion.", "answer": "thought"}, 239: {"question": "I am a fire that freezes, a frost that burns.", "answer": "jealousy"}, 240: {"question": "I am a wound that heals with time, yet leaves no scar.", "answer": "loss"}, 241: {"question": "I am a question with no answer, an answer with no question.", "answer": "paradox"}, 242: {"question": "I am a light in the darkness, yet I cast no shadow.", "answer": "star"}, 243: {"question": "I am a voice that echoes forever, yet I speak only once.", "answer": "legend"}, 244: {"question": "I am a wall that moves, a gate that stands still.", "answer": "curtain"}, 245: {"question": "I am a clock with no hands, a time with no measure.", "answer": "eternity"}, 246: {"question": "I am a tear that brings joy, a smile that hides pain.", "answer": "memory"}, 247: {"question": "I am a sword forged in silence, a battle fought in peace.", "answer": "truth"}, 248: {"question": "I am a crown worn by none, a kingdom ruled by all.", "answer": "dream"}, 249: {"question": "I am a mirror that shows the soul, a glass that never breaks.", "answer": "eye"}, 250: {"question": "I am a whisper that lingers, a breath that never fades.", "answer": "ghost"}, 251: {"question": "I am a flame that dances, a light that sings.", "answer": "candle"}, 252: {"question": "I am a book with no pages, a story with no end.", "answer": "life"}, 253: {"question": "I am a path walked by none, a journey taken by all.", "answer": "time"}, 254: {"question": "I am a key to every heart, yet I open no door.", "answer": "love"}, 255: {"question": "I am a shadow that leads, a light that follows.", "answer": "intuition"}, 256: {"question": "I am a song sung in silence, a melody heard in dreams.", "answer": "memory"}, 257: {"question": "I am a river that flows uphill, a mountain that sinks.", "answer": "imagination"}, 258: {"question": "I am a whisper in the wind, a secret in the stone.", "answer": "legend"}, 259: {"question": "I am a cloak of stars, a robe of night.", "answer": "sky"}, 260: {"question": "I am a crown of thorns, a throne of pain.", "answer": "sacrifice"}, 261: {"question": "I am a flame that consumes, a light that blinds.", "answer": "desire"}, 262: {"question": "I am a mirror to the past, a window to the future.", "answer": "memory"}, 263: {"question": "I am a gate that opens inward, a door that leads nowhere.", "answer": "mind"}, 264: {"question": "I am a sword with no edge, a battle with no victor.", "answer": "debate"}, 265: {"question": "I am a whisper that commands, a silence that rules.", "answer": "fear"}, 266: {"question": "I am a light that reveals, a darkness that hides. I am both truth and lies.", "answer": "mirror"}, 267: {"question": "I am a guest that never leaves, a shadow that never fades.", "answer": "memory"}, 268: {"question": "I am a voice with no mouth, a presence with no form.", "answer": "echo"}, 269: {"question": "I am a thread that binds all things, yet I am never seen.", "answer": "fate"}, 270: {"question": "I am a breath that gives life, yet I cannot be held.", "answer": "air"}, 271: {"question": "I am a treasure that cannot be stolen, a wealth that cannot be spent.", "answer": "knowledge"}, 272: {"question": "I am a wall that listens, a floor that speaks.", "answer": "hall"}, 273: {"question": "I am a blade that cuts only lies, a fire that burns only falsehood.", "answer": "truth"}, 274: {"question": "I am a road that never ends, a journey with no map.", "answer": "life"}, 275: {"question": "I am a storm in silence, a calm in chaos.", "answer": "mind"}, 276: {"question": "I am a prison with no bars, a cage with no key.", "answer": "fear"}, 277: {"question": "I am a whisper that deafens, a silence that screams.", "answer": "guilt"}, 278: {"question": "I am a mirror that never lies, yet shows only what you want to see.", "answer": "dream"}, 279: {"question": "I am a fire that warms the cold, yet burns the careless.", "answer": "love"}, 280: {"question": "I am a crown of light, a throne of flame.", "answer": "sun"}, 281: {"question": "I am a shadow that dances, a flame that hides.", "answer": "candlelight"}, 282: {"question": "I am a door that opens inward, yet leads outward.", "answer": "soul"}, 283: {"question": "I am a song sung by none, heard by all.", "answer": "wind"}, 284: {"question": "I am a step never taken, a path never walked.", "answer": "regret"}, 285: {"question": "I am a tear that brings joy, a laugh that brings pain.", "answer": "memory"}, 286: {"question": "I am a mask worn by all, yet owned by none.", "answer": "persona"}, 287: {"question": "I am a clock that ticks without time, a bell that rings without sound.", "answer": "heart"}, 288: {"question": "I am a flame that never flickers, a light that never fades.", "answer": "hope"}, 289: {"question": "I am a silence that speaks volumes, a void that echoes truth.", "answer": "emptiness"}, 290: {"question": "I am a chain that binds without touch, a bond that cannot break.", "answer": "loyalty"}, 291: {"question": "I am a mirror that reflects the soul, not the face.", "answer": "eye"}, 292: {"question": "I am a wound that never bleeds, a scar that never fades.", "answer": "betrayal"}, 293: {"question": "I am a whisper from the past, a guide to the future.", "answer": "history"}, 294: {"question": "I am a flame born of stone, a light born of darkness.", "answer": "ember"}, 295: {"question": "I am a riddle with no answer, a question with no end.", "answer": "life"}, 296: {"question": "I am a song with no melody, a poem with no rhyme.", "answer": "silence"}, 297: {"question": "I am a fortress with no walls, a shield with no weight.", "answer": "faith"}, 298: {"question": "I am a sword that heals, a wound that teaches.", "answer": "lesson"}, 299: {"question": "I am a river that flows backward, a tide that never turns.", "answer": "memory"}, 300: {"question": "I am a light that shines within, a fire that never burns out.", "answer": "spirit"},

# Layouts

## Goldene Regeln

### Dungeons

- L1/2 Dungeons sind immer offen (benötigen nie einen Schlüssel zum betreten)
- L3-5 Dungeons benötigen grundsätzlich einen Schlüssel. Sonderregel: Sollte es aufgrund der Kartengröße dazu kommen, dass es mehr L3-5 Dungeons als Schlüssel gibt, so sind auch Dungeons offene Dungeons möglich
- Du kannst Türen, Gitter und Fallen selbstständig platzieren (in seltenen Fällen haben Layouts ergänzende Informationen). Nutze dies aktiv um das Dungeon in verschiedene Bereiche aufzuteilen und dem Spieler Schutz zu bieten (ansonsten besteht die Gefahr, dass die Monster den Spieler überrennen, da sie nicht durch Gitter/Türen aufgehalten werden)
- Nutze das Objekt der Laterne und gezielt Lichtquellen in Dungeons zu verteilen
- Die Layout-Anforderungen der Quests haben Priorität über die Layouts

### Caves

- Sind immer offen (benötigen nie einen Schlüssel zum betreten)
- Nutze niemals menschlich gebaute Objekte für die Funktionen (Türen, Gitter, Sperrfallen, Fallgruben, Fallbeilfallen, etc.)
- Es können versteckte Wände genutzt werden und "Puddle" Fallen (ID92, ID120, ID121)
- Erlaubte Deko Objekte: ID12, ID16, ID38, ID73, ID70, ID117

## Legende

| Kürzel | Bedeutung |
| --- | --- |
| DEN | Dungeon/Cave entrance |
| DD | Dungeon Door (nur als Illustration, um Layoutlogic zu erklären) |
| DF | Dungeon/Cave floor |
| DST | Dungeon Stairs (nur in Türmen) |
| DW | Dungeon/Cave wall |
| CO1-CO4 | Spaceship Wand mit Außenrundung. Rundung link&oben/oben&rechts/recht&unten/unten&links (Objekt ID85 oder direkt in der Engine rund dargestellt) |
| CI1-CI4 | Spaceship Wand mit Innenrundung. Rundung linksoben/rechtsoben/rechtsunten/linksunten (Objekt ID84 oder direkt in der Engine rund dargestellt) |
| CF | Spaceship floor |
| CW | Spaceship wall |
| FD | Fort/Castle door |
| FF | Fort/Castle floor |
| FW | Fort/Castle wall |
| TH | Throne (with king character in front of it) |
| ST | Statue in castle, always facing in a 45° angle towards the inside |

## dungeon\_1 (ein langes Dungeon)

- Das Dungeon ist ein langer Schlauch, der durch Räume führt
- Es kann kleine Einbuchtungen geben, die für Quest Objekte (z.B. Statuen) oder Dekorationen genutzt werden können
- Sofern nicht anders im Quest beschrieben, werden diese so platziert, dass im letzten Raum das Quest beendet werden kann und damit der End-Raum erreicht werden kann

|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  | DW | DF | DW | DF | DW | DF | DW | DF | DW | DF | DW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  | DW | DF | DW | DF | DW | DF | DW | DF | DW | DF | DW | DW | DW | DW | DW | DW |  | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW |  |  |  |
| DW | DW | DF | DW | DF | DW | DF | DW | DF | DW | DF | DW | DW | DF | DF | DF | DW | DW | DW | DF | DW | DF | DW | DF | DW | DF | DW | DF | DW | DW | DW | DW |
| DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DW | DW | DF | DW | DF | DW | DF | DW | DF | DW | DF | DW | DW | DF | DW |
| DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DF | DW |
| DW | DW | DF | DW | DF | DW | DF | DW | DF | DW | DF | DW | DW | DF | DF | DF | DF | DW | DW |  |  |  |  |  |  |  |  |  |  | DW | DF | DW |
|  | DW | DF | DW | DF | DW | DF | DW | DF | DW | DF | DW | DW | DF | DW | DW | DF | DF | DW |  |  | DW | DW | DW | DW | DW | DW | DW |  | DW | DF | DW |
|  | DW | DF | DW | DF | DW | DF | DW | DF | DW | DF | DW | DW | DF | DW | DW | DW | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DW |
|  | DW | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW | DF | DF | DW | DW | DF | DF | DF | DW | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DF | DW |
|  |  |  |  |  | DW | DF | DW | DW | DW | DW | DW | DF | DW | DW | DW | DF | DF | DF | DW | DF | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DW |
|  |  |  |  |  | DW | DF | DW | DW | DF | DF | DF | DF | DW |  | DW | DF | DW | DW | DW | DF | DW |  | DW | DF | DF | DF | DW | DW | DW | DW | DW |
|  |  |  |  |  | DW | DF | DF | DF | DF | DF | DW | DW | DW |  | DW | DF | DW | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW |  |  |  |  |
|  |  | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DF | DW | DF | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW | DW | DW |  |
| DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW |
| DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DW | DW | DF | DF | DW |
| DW | DF | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW |  |  |  |  |  |  |  | DW | DF | DF | DF | DW | DW | DW | DF | DW |
| DW | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW |  |  |  | DW | DW | DW |  |  |  |  |  | DW | DW | DW | DW | DW |  | DW | DF | DW |
| DW | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DW |  |  |  |  |  | DW | DF | DW |
| DW | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW |  |  |  |  |  | DW | DF | DW |
| DW | DF | DW | DW | DF | DF | DW | DF | DW | DW | DF | DW | DW | DF | DW | DW | DF | DW | DW | DW | DW | DF | DW | DW |  |  |  |  |  | DW | DF | DW |
| DW | DF | DW | DW | DF | DF | DW | DF | DF | DW | DW | DW | DF | DF | DW | DW | DF | DW | DW |  | DW | DF | DW |  |  |  |  |  |  | DW | DF | DW |
| DW | DF | DW | DW | DF | DW | DW | DF | DF | DF | DW | DF | DF | DF | DW | DF | DF | DF | DW | DW | DW | DF | DW |  | DW | DW | DW | DW | DW | DW | DF | DW |
| DW | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DW | DW | DF | DW |  | DW | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DW | DW | DF | DW | DW | DF | DW | DF | DW | DF | DW | DF | DW | DF | DF | DF | DW | DW | DW | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DW | DF | DF | DW | DF | DW | DF | DW | DF | DW | DW | DF | DW | DW |  | DW | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DW | DW | DW | DF | DW | DW | DF | DW | DF | DW | DF | DW | DF | DW | DW | DF | DW | DW |  | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |
|  |  |  | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DW |  | DW | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW |
|  |  |  | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DF | DW | DW |  | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | DW | DF | DW |  |  |  |  |  |  |  | DW | DW | DW |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | DW | DF | DW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | DW | DEN | DW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

## dungeon\_2 (verzweigter Eingang)

- Es gibt eine ca. 5x4 große Eingangshalle. Von ihr führen Wege zu verschiedenen Räumen
- Die Wege sind am Anfang und am Ende durch Türen versperrt
- In dieser Beispielkarte ist in Blöcken "29" geschrieben. Dies soll ignoriert werden, da es spezifisch für ein Quest ist

|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |  |  | DW | DEN | DW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  | DW | DF | DW |  |  |  |  |  |  |  | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW |
|  |  |  | DW | DW | DW | DW | DW |  |  | DW | DW | DW | DF | DW | DW | DW |  |  |  |  |  | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DW | DW | DW | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DW | DW | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW |  | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DW |  |  |  |  | DW | DF | DW | DW | DF | DW | DF | DW | DF | DW | DW | DF | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW |
| DW | DF | DW | DW | DW | DW | DW | DW | DF | DW | DW | DF | DW | DF | DW | DF | DW | DW | DW | DF | DF | DW | DW | DW |  |  |  |  |  |  |  |  |
| DW | DF | DF | DF | DF | DF | DW | DW | DF | DW | DW | DF | DW | DF | DW | DF | DF | DW | DW | DW | DF | DF | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW |
| DW | DF | DF | DF | DF | DF | DW | DW | DF | DW | DF | DF | DW | DF | DW | DF | DF | DF | DF | DW | DW | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DW | DF | DW | DF | DF | DW | DF | DW | DW | DW | DW | DF | DF | DW | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DW | DF | DW | DW | DF | DW | DF | DW |  |  | DW | DF | DF | DW | DF | DF | DW | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DW | DF | DW | DW | DF | DW | DF | DW |  |  | DW | DW | DF | DW | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DW | DF | DW | DW | DF | DW | DF | DW |  |  |  | DW | DF | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DW | DW | DW | DW | DW | DW | DW | DF | DW | DW | DF | DW | DF | DW |  |  |  | DW | DF | DW | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW |
|  |  | DW | DF | DF | DF | DF | DF | DF | DW | DF | DF | DW | DF | DW | DW | DW |  | DW | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW |
|  |  | DW | DF | DW | DW | DW | DW | DW | DW | DF | DW | DW | DF | DF | DF | DW |  | DW | DF | DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DF | DW | DW | DF | DF | DF | DW | DW | DW | DW | DW | DW | DF | DW | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DW | DW | DF | DF | DF | DF | DW |  |  |  | DW | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW |
| DW | DF | DF | DF | DF | DF | DW | DW | DF | DF | DW | DW | DW | DF | DF | DF | DF | DW |  |  |  | DW | DF | DF | DW | DW | DW | DW | DW | DW | DW | DW |
| DW | DF | DF | DF | DF | DF | DW | DF | DF | DW | DW |  | DW | DW | DF | DF | DF | DW |  |  |  | DW | DW | DF | DW | DW | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DF | DW | DW |  |  |  | DW | DW | DW | DF | DW |  |  |  |  | DW | DF | DW | DW | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DF | DW | DW |  | DW | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DF | DF | DW |  | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW |
| DW | DW | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW | DF | DW | DW | DF | DF | DW | DW | DW | DF | DW |  |  |  | DW | DF | DF | DF | DF | DF | DW |
| DW | DW | DW | DW | DW | DW | DW | DW | DF | DF | DW | DW | DF | DF | DW | DF | DF | DW | DF | DW | DF | DW |  |  |  | DW | DW | DW | DW | DW | DW | DW |
| DW | DF | DF | DF | DF | DF | DF | DW | DW | DF | DW | DW | DF | DW | DW | DF | DF | DW | DW | DW | DF | DW |  |  |  |  |  |  |  |  |  |  |
| DW | DF | DF | DF | DF | DF | DF | DW | DW | DF | DW | DW | DF | DW | DF | DF | DF | DF | DF | DW | DF | DW |  |  |  |  |  |  |  |  |  |  |
| DW | DF | DF | DF | DF | DF | DF | DW | DW | DF | DW | DW | DF | DW | DW | DF | DF | DF | DF | DW | DF | DW |  |  |  |  |  |  |  |  |  |  |
| DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |  |  |  |  |  |  |  |  |  |
| DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW |
| DW | DF | DF | DF | DF | DF | DF | DW |  |  |  | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DW | DW | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DF | DW |  |  |  | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DW | DW | DW | DW | DW | DW | DW |  |  |  | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW |

## dungeon\_3 (Labyrinth)

- Das Dungeon besteht aus einem Labyrinth, dass fast ausschließlich aus Gängen besteht
- Werden Räume benötigt, sind diese klein (3x3 bis max. 4x4)
- Die Zwischenwände sind 1 Feld breit
- Es gibt keine Türen/Gitter
- Es existieren Teleportfelder (Rune, ID73) als Absperrungen, die den Spieler an einen anderen Ort transportieren. Die Teleporter **müssen** so angelegt werden, dass sie übersprungen werden können, d.h. jeder Teil des Dungeons ist erreichbar
- L1 Dungeons sind ca. 25x25 groß, L2: 32x32, L3: 39x39, L4: 47x47 und L5:55x55

|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |  | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW |
|  | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |
|  | DW | DF | DF | DW | DF | DF | DF | DW | DF | DW | DF | DF | DW | DW | DW | DW | DW | DF | DW | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW |
|  | DW | DW | DF | DW | DF | DW | DW | DW | DF | DW | DW | DF | DF | DF | DF | DF | DW | DF | DW | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DW |
|  | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW | DF | DW | DW | DF | DW | DW | DW | DW | DF | DW |
| DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DF | DW | DF | DW | DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DW | DF | DF | DF | DW |
| DW | DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DW | DF | DW | DF | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW | DF | DW |
| DW | DW | DW | DF | DW | DF | DW | DW | DW | DW | DW | DW | DF | DF | DF | DW | DF | DF | DF | DF | DW | DF | DW | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DW |
|  | DW | DF | DF | DW | DF | DF | DW | DW | DW | DF | DF | DF | DW | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW |
|  | DW | DW | DF | DW | DF | DW | DW | DF | DF | DF | DW | DF | DW | DF | DW | DW | DW | DF | DF | DF | DF | DW | DF | DF | DF | DF | DW | DF | DW | DF | DF | DW | DW |
| DW | DW | DF | DF | DW | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DW | DF | DW | DW | DF | DF | DF | DW | DW | DF | DF | DW |
| DW | DF | DF | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DW | DW | DF | DW | DW | DF | DF | DW | DF | DW | DF | DF | DW | DW | DW | DF | DF | DW | DW | DF | DW |
| DW | DF | DW | DW | DF | DF | DF | DF | DF | DW | DF | DW | DF | DW | DF | DF | DF | DW | DF | DW | DW | DW | DW | DW | DF | DF | DF | DW | DW | DF | DF | DW | DW | DW |
| DW | DF | DF | DW | DF | DW | DW | DF | DW | DW | DF | DW | DF | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DW | DW | DW | DF | DF | DW | DW | DF | DF | DF | DW |
| DW | DF | DW | DW | DF | DF | DW | DF | DW | DF | DF | DW | DF | DW | DF | DF | DF | DW | DF | DW | DW | DW | DF | DF | DF | DW | DW | DF | DF | DW | DW | DW | DF | DW |
| DW | DF | DF | DW | DF | DW | DW | DF | DF | DF | DW | DW | DF | DW | DW | DF | DW | DW | DF | DF | DF | DW | DF | DW | DF | DF | DW | DW | DF | DW | DF | DF | DF | DW |
| DW | DF | DW | DW | DF | DF | DW | DF | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DF | DW | DW | DW | DW | DF | DF | DF | DF | DW | DF | DW | DW | DW |
| DW | DF | DF | DW | DF | DW | DW | DF | DW | DF | DW | DW | DF | DW | DW | DW | DF | DW | DW | DW | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DF | DW | DF | DW |
| DW | DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DF | DF | DF | DF | DW | DW | DW | DW | DF | DW | DF | DF | DF | DF | DF | DF | DW | DF | DW |
| DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DW | DW | DW | DW | DW | DW | DW | DW | DF | DW | DF | DW | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DF | DW |
|  | DW | DF | DF | DF | DF | DF | DF | DW | DF | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DW | DF | DW | DW | DF | DW | DF | DF | DF | DF | DW |
|  | DW | DF | DW | DW | DW | DW | DF | DW | DF | DW | DW | DW | DF | DW | DW | DF | DW | DW | DW | DW | DW | DW | DW | DF | DW | DF | DF | DF | DF | DW | DW | DW | DW |
|  | DW | DW | DW | DF | DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DW | DF | DW | DF | DF | DF | DF | DW | DF | DF | DF | DF | DW | DF | DW | DW | DF | DW |  |
|  | DW | DF | DF | DF | DW | DW | DF | DW | DW | DF | DW | DF | DW | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DW |  |
|  | DW | DW | DW | DW | DW | DF | DF | DF | DW | DW | DW | DW | DW | DF | DW | DW | DW | DF | DF | DW | DF | DW | DW | DW | DF | DF | DW | DF | DW | DW | DF | DW |  |
|  | DW | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DF | DW | DW | DF | DW | DF | DW | DW | DF | DW | DF | DF | DW | DF | DW |  |
|  | DW | DF | DW | DW | DW | DF | DW | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW | DF | DF | DF | DF | DW | DF | DW | DF | DF | DW | DF | DW | DW | DF | DW |  |
|  | DW | DF | DW | DF | DW | DF | DW | DF | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DW | DW | DW | DW | DF | DW | DW | DF | DW | DF | DF | DW | DF | DW |  |
|  | DW | DF | DW | DF | DW | DF | DF | DF | DW | DW | DW | DF | DW | DF | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DW |  |
|  | DW | DF | DF | DF | DW | DF | DW | DF | DW | DF | DW | DF | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DF | DW | DW | DF | DF | DW | DF | DW |  |
|  | DW | DW | DW | DW | DW | DF | DW | DF | DW | DF | DW | DW | DW | DF | DW | DF | DW | DF | DW | DF | DF | DF | DF | DW | DF | DF | DW | DW | DF | DW | DW | DW | DW |
| DW | DW | DF | DW | DF | DW | DF | DW | DF | DW | DF | DF | DF | DF | DF | DW | DF | DW | DF | DW | DW | DW | DW | DF | DW | DW | DF | DF | DW | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DW | DW | DW | DW | DW | DW |
| DW | DW | DW | DW | DW | DW | DW | DW | DW | DW |  |  |  |  |  |  |  | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DEN | DW |  |  |  |  |  |

## dungeon\_4 (Klassisches Dungeon)

- Ein sich vom Eingang verzweigendes Dungeon
- Bereiche können über mehr als einen Weg erreichbar sein
- Zugänge zu größeren Räumen sind durch Türen/Gitter abgesperrt
- Fallen können in Gängen und Räumen auftreten. Es darf allerdings auch Dungeons ohne Fallen geben
- Es kann kleine Bereiche geben (z.B. einen 2x2 Raum oder wie im 2. & 3. Beispiel ein Kreuz (3 Felder breit plus 1 Feld oben und unten). Hier befinden sich große Schätze oder Attributverbesserungen

### Beispiel 1

|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  | DW | DW | DW | DW | DW |  |  |  |  |  |  |  |  |  | DW | DW | DW | DW | DW | DW | DW | DW | DW |  |  |  | DW | DW | DW | DW | DW | DW | DW |
| DW | DW | DF | DW | DF | DW |  |  |  |  |  |  |  |  |  | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DW |  | DW | DW | DW |  |  |  |  |  | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DW | DF | DF | DF | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |  | DW | DW | DW | DW | DW | DW | DW |
| DW | DW | DF | DF | DF | DW | DW | DW | DF | DW | DW | DW | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW |  |  |  |  |  |  |  |
| DW | DF | DF | DF | DF | DW |  | DW | DF | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DF | DW | DW |  |  |  |  |  |  |
| DW | DW | DF | DW | DF | DW |  | DW | DF | DW | DF | DF | DF | DF | DF | DW | DW |  |  |  |  |  |  | DW | DF | DF | DF | DW | DW |  |  |  |  |  |
|  | DW | DW | DW | DW | DW |  | DW | DF | DW | DF | DF | DF | DF | DF | DW | DF | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW |  |  |  |  |
|  |  |  |  |  |  |  | DW | DF | DW | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |  |  |  |
| DW | DW | DW | DW | DW |  |  | DW | DF | DW | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW |  |  |  |  |
| DW | DF | DF | DF | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DW | DF | DW | DW |  |  |  | DW | DW | DF | DF | DF | DW | DW |  |  |  |  |  |
| DW | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |  |  |  | DW | DW | DF | DW | DW | DW |  |  |  |  |  |
| DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DF | DW | DW | DW | DF | DW | DW |  |  |  |  |  | DW | DW | DW | DF | DW | DW |  |  |  |  |
| DW | DF | DF | DF | DW | DW | DW | DW |  |  |  | DW | DF | DW | DW | DW | DF | DW | DW |  |  |  |  |  | DW | DF | DF | DF | DF | DW |  |  |  |  |
| DW | DF | DF | DF | DF | DW |  |  |  |  |  | DW | DF | DW | DW | DF | DF | DF | DW |  |  |  | DW | DW | DW | DF | DF | DF | DW | DW |  |  |  |  |
| DW | DW | DW | DW | DW | DW |  |  |  |  |  | DW | DF | DW | DW | DF | DF | DF | DW |  |  | DW | DW | DF | DF | DF | DF | DF | DW |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  | DW | DF | DW | DW | DW | DF | DW | DW |  | DW | DW | DF | DF | DW | DF | DF | DF | DW | DW |  |  |  |  |
| DW | DW | DW | DW | DW | DW | DW | DW | DW |  |  | DW | DF | DW |  | DW | DF | DW | DW | DW | DW | DF | DF | DW | DW | DF | DF | DF | DF | DW |  |  |  |  |
| DW | DF | DF | DF | DF | DF | DF | DF | DW |  |  | DW | DF | DW |  | DW | DF | DW | DW | DF | DF | DF | DW | DW |  | DW | DW | DF | DW | DW |  |  |  |  |
| DW | DF | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW | DF | DW | DW | DW | DF | DW | DW | DF | DW | DW | DW |  |  |  | DW | DW | DW |  |  |  |  |  |
| DW | DF | DW | DF | DF | DW | DF | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW |  |  |  |  |  |  |  |  |
| DW | DF | DW | DF | DF | DW | DF | DW | DF | DW | DW | DW | DF | DW | DW | DW | DF | DW | DW | DW | DW | DF | DF | DF | DF | DW |  |  |  |  |  |  |  |  |
| DW | DF | DW | DF | DF | DW | DF | DW | DF | DW |  | DW | DF | DW |  | DW | DF | DW | DW | DW | DW | DF | DF | DF | DF | DW |  |  |  |  |  |  |  |  |
| DW | DF | DW | DF | DF | DW | DF | DW | DF | DW |  | DW | DF | DW |  | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |  |  |  |  |  |  |  |
| DW | DF | DW | DF | DW | DW | DF | DW | DF | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DW |  |  |  |  |  |  |  |  |
| DW | DF | DW | DF | DW | DW | DF | DW | DF | DW | DW | DF | DF | DF | DW |  |  |  |  |  | DW | DF | DF | DF | DF | DW |  |  |  |  |  |  |  |  |
| DW | DF | DW | DF | DW | DW | DF | DW | DF | DW | DW | DF | DF | DF | DW |  |  |  |  |  | DW | DF | DF | DF | DF | DW |  |  |  |  |  |  |  |  |
| DW | DF | DW | DF | DF | DF | DF | DW | DF | DW | DW | DF | DF | DF | DW |  |  |  |  |  | DW | DW | DW | DW | DW | DW |  |  |  |  |  |  |  |  |
| DW | DF | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW | DF | DW | DW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| DW | DF | DF | DF | DF | DF | DF | DF | DF | DW |  | DW | DF | DW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| DW | DW | DW | DW | DW | DW | DW | DW | DW | DW |  | DW | DEN | DW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

### Beispiel 2

|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  | DW | DW | DW | DW | DW | DW | DW | DW |  |  |  |  |  |  |  |  |  | DW | DW | DW |  |  |  | DW | DW | DW | DW | DW | DW | DW |
|  |  | DW | DF | DF | DF | DF | DF | DF | DW |  |  | DW | DW | DW |  |  |  | DW | DW | DF | DW | DW |  |  | DW | DF | DF | DW | DF | DF | DW |
|  |  | DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DF | DW | DW |  | DW | DW | DF | DF | DF | DW | DW |  | DW | DF | DF | DF | DF | DF | DW |
|  |  | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DW |  | DW | DF | DF | DF | DF | DF | DW |
|  |  | DW | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DW |  | DW | DF | DF | DF | DF | DF | DW |
|  |  | DW | DW | DF | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW |  | DW | DW | DW | DF | DW | DW | DW |
|  |  | DW | DW | DF | DW | DW |  |  | DW | DW | DF | DF | DF | DF | DF | DW | DW |  | DW | DW | DF | DW | DW |  |  | DW | DW | DF | DW | DW |  |
|  |  | DW | DF | DF | DF | DW |  |  |  | DW | DW | DF | DF | DF | DW | DW |  |  | DW | DW | DF | DW |  |  |  | DW | DF | DF | DF | DW |  |
|  |  | DW | DF | DF | DF | DW | DW |  |  |  | DW | DW | DF | DW | DW |  |  | DW | DF | DF | DF | DW |  |  |  | DW | DF | DF | DF | DW |  |
|  |  | DW | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DF | DW |  |  |  | DW | DF | DW | DW | DW |  |  |  | DW | DF | DF | DF | DW |  |
|  |  | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |  |  | DW | DF | DW | DW | DW | DW |  |  | DW | DW | DF | DF | DW |  |
|  |  |  |  |  | DW | DW | DF | DF | DF | DF | DF | DF | DW | DW |  |  |  | DW | DF | DF | DF | DF | DW |  |  |  | DW | DF | DF | DW |  |
|  |  | DW | DW | DW |  | DW | DW | DW | DF | DW | DW | DW | DW | DEN | DW |  |  | DW | DW | DW | DW | DF | DW |  |  |  | DW | DF | DF | DW | DW |
| DW | DW | DW | DF | DW | DW | DW |  | DW | DF | DW |  |  | DW | DF | DW |  |  |  |  |  | DW | DF | DW | DW | DW | DW | DW | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DW |  | DW | DW | DF | DW | DW |  |  |  |  | DW | DF | DF | DF | DF | DW | DW | DW | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DW |  |  |  | DW | DW | DW | DW | DF | DW |  | DW | DW | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW |  |  |  | DW | DW | DW | DF | DW | DW | DW | DW | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW |  |  | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DW | DW | DF | DW | DW | DW | DF | DW | DW | DF | DF | DF | DF | DW | DF | DF | DF | DF | DW | DW | DW | DF | DF | DW | DW | DW | DW | DW | DW | DW | DW |
|  |  | DW | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DW |  |  |
|  |  | DW | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DW | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DW |  |  |
|  |  | DW | DW | DW | DF | DW |  |  | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW |  | DW | DW | DW | DW | DF | DW | DW | DF | DW |  |  |
|  | DW | DW | DW | DW | DF | DW |  |  |  | DW | DW | DF | DF | DF | DF | DF | DW | DW |  |  | DW | DF | DF | DF | DF | DW | DW | DF | DW |  |  |
|  | DW | DF | DF | DF | DF | DW |  | DW | DW | DW | DW | DW | DF | DF | DF | DW | DW |  |  | DW | DW | DF | DW | DW | DW | DW | DW | DF | DW | DW | DW |
|  | DW | DF | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW | DW | DF | DW | DW |  |  |  | DW | DF | DF | DW |  | DW | DF | DF | DF | DF | DF | DW |
|  | DW | DF | DW | DW | DW |  | DW | DF | DF | DF | DW |  | DW | DF | DW |  |  |  |  | DW | DF | DW | DW |  | DW | DF | DF | DF | DF | DF | DW |
|  | DW | DF | DF | DF | DW |  | DW | DW | DF | DW | DW |  | DW | DF | DW |  |  | DW | DW | DW | DF | DW |  |  | DW | DF | DF | DF | DF | DF | DW |
|  | DW | DW | DW | DF | DW |  |  | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW | DW | DF | DF | DF | DW |  |  | DW | DF | DF | DF | DF | DF | DW |
|  |  |  | DW | DF | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DW | DF | DW | DW | DW |  |  | DW | DW | DW | DF | DW | DW | DW |
|  |  |  | DW | DF | DF | DW | DF | DF | DF | DF | DF | DF | DW | DF | DW | DW | DF | DF | DF | DW |  |  |  |  |  |  | DW | DW | DW |  |  |
|  |  |  | DW | DW | DF | DF | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  | DW | DW | DW | DW | DW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

### Beispiel 3

|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |  | DW | DEN | DW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  | DW | DW | DW |  |  |  |  |  |  |  | DW | DF | DW |  |  |  |  |  | DW | DW | DW | DW | DW | DW | DW |  | DW | DW | DW | DW | DW |
|  | DW | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW |  |  |  | DW | DF | DF | DF | DF | DF | DW |  | DW | DF | DF | DF | DW |
|  | DW | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DW |  |  |  | DW | DF | DW | DW | DF | DW | DW |  | DW | DF | DF | DF | DW |
|  | DW | DF | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DF | DW | DW | DF | DW |  |  | DW | DW | DF | DW | DW |
|  | DW | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DW | DW | DF | DW | DW | DW | DW | DW | DF | DW |  |
|  | DW | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |
| DW | DW | DF | DW | DW | DW | DW | DW | DW | DW | DW | DF | DW | DF | DW | DW | DW | DW | DW |  |  | DW | DW | DF | DW | DW | DW | DW | DW | DW | DW |  |
| DW | DF | DF | DF | DW | DW |  |  |  |  | DW | DF | DF | DF | DW |  |  |  |  |  |  |  | DW | DW | DW |  |  |  |  |  |  |  |
| DW | DF | DF | DF | DF | DW |  |  |  |  | DW | DW | DF | DW | DW |  |  | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW |  |
| DW | DF | DF | DF | DF | DW | DW |  |  |  |  | DW | DF | DW |  |  | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |
| DW | DF | DF | DF | DF | DF | DW |  |  |  | DW | DW | DF | DW | DW |  | DW | DF | DF | DF | DW | DF | DF | DF | DF | DF | DW | DF | DF | DW | DW |  |
| DW | DW | DW | DF | DW | DW | DW |  |  | DW | DW | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |  |
| DW | DW | DW | DF | DW | DW | DW |  |  | DW | DF | DF | DF | DF | DF | DW |  | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |  |
| DW | DF | DF | DF | DF | DF | DW |  | DW | DW | DF | DF | DF | DF | DF | DW |  | DW | DF | DW | DW | DW | DW | DF | DW | DW | DW | DW | DF | DW |  |  |
| DW | DF | DF | DF | DF | DF | DW |  | DW | DF | DF | DF | DF | DF | DF | DW |  | DW | DW | DW | DW | DW | DW | DF | DW |  |  | DW | DW | DW |  |  |
| DW | DF | DF | DF | DF | DF | DW |  | DW | DW | DF | DF | DF | DF | DF | DW |  |  | DW | DF | DF | DF | DF | DF | DW |  |  |  |  |  |  |  |
| DW | DF | DF | DF | DF | DF | DW |  |  | DW | DF | DF | DF | DF | DF | DW |  | DW | DW | DF | DF | DW | DW | DW | DW |  |  |  |  |  |  |  |
| DW | DF | DF | DF | DF | DF | DW |  |  | DW | DW | DF | DW | DF | DW | DW |  | DW | DF | DF | DF | DW |  |  |  |  |  |  |  |  |  |  |
| DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW | DF | DW | DF | DW | DW | DW | DW | DF | DF | DF | DW |  |  |  | DW | DW | DW | DW |  |  |  |
|  |  |  |  |  | DW | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DW | DW | DW |  |  |  | DW | DF | DF | DW |  |  |  |
|  |  |  |  |  | DW | DW | DF | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DF | DF | DF | DW |  |  |  | DW | DF | DF | DW |  |  |  |
|  |  |  |  |  |  | DW | DF | DW | DW | DW | DF | DW | DW |  |  |  | DW | DW | DF | DF | DW |  |  |  | DW | DW | DW | DW |  |  |  |
|  |  |  |  |  | DW | DW | DF | DW | DW | DF | DF | DF | DW |  |  |  | DW | DW | DF | DF | DW | DW |  |  |  |  |  |  |  |  |  |
|  |  |  |  | DW | DW | DF | DF | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DW |  |  |  |  |  |  |  |  |  |
|  |  |  |  | DW | DF | DF | DW | DW |  | DW | DW | DW |  | DW | DF | DF | DF | DF | DF | DF | DF | DW |  |  |  |  |  |  |  |  |  |
| DW | DW | DW | DW | DW | DF | DW | DW |  |  |  |  |  |  | DW | DF | DW | DW | DW | DF | DW | DW | DW |  |  |  |  |  |  |  |  |  |
| DW | DF | DF | DF | DF | DF | DF | DW |  |  |  |  |  |  | DW | DF | DW |  | DW | DW | DW |  |  | DW | DW | DW | DW | DW | DW | DW | DW |  |
| DW | DW | DF | DF | DF | DF | DW | DW |  |  |  |  |  |  | DW | DF | DW | DW | DW | DW | DW | DW |  | DW | DF | DF | DF | DF | DF | DF | DW | DW |
| DW | DF | DF | DF | DF | DF | DF | DW |  |  |  |  |  |  | DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DW | DF | DF | DF | DF | DW | DW |  |  |  |  |  |  | DW | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW |
|  | DW | DW | DW | DW | DW | DW |  |  |  |  |  |  |  | DW | DW | DW |  |  | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DW |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | DW | DW | DW | DW | DW | DW | DW | DW |  |

## dungeon\_6 (Tower)

- In Level 1-2 kleiner Turm (Beispiel 1), >Level 2 großer Turm (Beispiel 2)
- Jeder Turm hat 2-3 Etagen. Diese können durch Treppen (DST) erreicht werden. Wichtig: Die Treppen auf der nächsten Etage müssen sich an der gleichen Stelle befinden, wie aus der Ursprungsetage
- Als Dungeon Eingang nutze die Fort-Tür aus dem Schloss.
- Als Wände nutze die Steinwand aus dem Schloss.
- Als Decke nutze die klassische Dungeon Decke
- Als Türen nutze nur Dungeon Türen (mit der Steinwand)
- Als Boden nutze den Holzboden
- Im Außenlevel den Turm auf 2x2 Felder platzieren. Es führen keine Straßen zu dem Turm.
- Als Treppe bei Aufgang wird das Modell "Spiral Staircase" genutzt. Das obere Ende endet in der Fort Tür (die auch in Schlössern verwendet wird). Man startet auf dem nächsten Level dann vor dieser (d.h. Aufgang immer Wendeltreppe, Abgang Fort-Tür).
- Es soll keine Ladesequenzen zwischen dem Etagenwechsel geben. Die Stufen fungieren wie ein Teleport (ohne Teleport SFX) auf der gleichen Karten. Sie müssen auf der Karte von 10 Blöcken getrennt sein, damit man sich nicht mit dem Teleportzauber zwischen den Etagen hin- und her transportieren kann
- Runde Grundform, aufgeteilt in Räume
- Räume sind durch 1-3 Türen miteinander verbunden oder können auch Geheimräume sein (durchbrechbare Mauer)

### Beispiel 1

|  |  |  |  |  |  | DW | DW | DW |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  | DW | DW | DW | DW | DW | DW | DW |  |  |  |  |
|  |  |  | DW | DW | DF | DF | DW | DF | DF | DW | DW |  |  |  |
|  |  | DW | DW | DF | DF | DF | DW | DF | DF | DF | DW | DW |  |  |
|  | DW | DW | DF | DF | DF | DF | DD | DF | DF | DF | DF | DW | DW |  |
|  | DW | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DST | DW |  |
| DW | DW | DF | DF | DF | DF | DF | DW | DD | DW | DW | DW | DW | DW | DW |
| DW | DW | DW | DD | DW | DW | DW | DW | DF | DW | DF | DF | DF | DF | DW |
| DW | DW | DF | DF | DF | DF | DW | DF | DF | DW | DF | DF | DF | DW | DW |
|  | DW | DF | DF | DF | DF | DW | DF | DF | DW | DF | DF | DF | DW |  |
|  | DW | DW | DF | DF | DF | DD | DF | DF | DD | DF | DF | DW | DW |  |
|  |  | DW | DW | DF | DF | DW | DF | DF | DW | DF | DW | DW |  |  |
|  |  |  | DW | DW | DF | DW | DF | DF | DW | DW | DW |  |  |  |
|  |  |  |  | DW | DW | DW | DF | DW | DW | DW |  |  |  |  |
|  |  |  |  |  |  | DW | DEN | DW |  |  |  |  |  |  |

### Beispiel 2

|  |  |  |  |  |  |  |  |  | DW | DW | DW | DW |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  | DW | DW | DW | DW | DF | DF | DW | DW | DW | DW |  |  |  |  |  |  |
|  |  |  |  | DW | DW | DW | DF | DF | DW | DF | DF | DF | DF | DF | DW | DW | DW |  |  |  |  |
|  |  |  | DW | DW | DF | DF | DF | DF | DW | DF | DF | DF | DF | DF | DW | DF | DW | DW |  |  |  |
|  |  | DW | DW | DF | DF | DF | DF | DF | DD | DF | DF | DF | DF | DF | DD | DF | DF | DW | DW |  |  |
|  |  | DW | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DF | DW | DF | DF | DST | DW |  |  |
|  | DW | DW | DW | DW | DW | DW | DD | DW | DW | DW | DW | DD | DW | DW | DW | DW | DW | DW | DW | DW |  |
|  | DW | DF | DF | DF | DW | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DW | DF | DF | DF | DW |  |
|  | DW | DF | DF | DF | DD | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DW | DF | DF | DF | DW |  |
| DW | DW | DF | DF | DF | DW | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DW | DF | DF | DF | DW | DW |
| DW | DF | DF | DF | DF | DW | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DW | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DW | DW | DD | DW | DW | DW | DW | DW | DD | DW | DW | DW | DF | DF | DF | DF | DW |
| DW | DW | DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DW | DW | DD | DW | DW | DW |
|  | DW | DW | DD | DW | DW | DW | DW | DW | DW | DF | DF | DW | DF | DF | DF | DW | DF | DF | DF | DW |  |
|  | DW | DF | DF | DF | DF | DF | DF | DF | DW | DF | DF | DD | DF | DF | DF | DD | DF | DF | DF | DW |  |
|  | DW | DW | DF | DF | DF | DF | DF | DF | DW | DF | DF | DW | DF | DF | DF | DW | DF | DF | DW | DW |  |
|  |  | DW | DF | DF | DF | DF | DF | DF | DD | DF | DF | DW | DF | DF | DF | DW | DF | DF | DW |  |  |
|  |  | DW | DW | DF | DF | DF | DF | DF | DW | DF | DF | DW | DF | DF | DF | DW | DF | DW | DW |  |  |
|  |  |  | DW | DW | DF | DF | DF | DF | DW | DF | DF | DW | DF | DF | DF | DW | DW | DW |  |  |  |
|  |  |  |  | DW | DW | DW | DF | DF | DW | DF | DF | DW | DF | DF | DW | DW | DW |  |  |  |  |
|  |  |  |  |  |  | DW | DW | DW | DW | DF | DF | DW | DW | DW | DW |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  | DW | DEN | DW | DW |  |  |  |  |  |  |  |  |  |

## cave\_1 (Außenring mit Zugängen in die Mitte)

- Ein 2-3 Felder breiter Ring
- Nach außen 2-5 Auswölbungen (ca. 20-25 Felder Größe)
- Nach innen kleinere organische Räume
- Die Eingänge zu den inneren Räumen können offen sein oder versteckt (zerstörbare Wände)

|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  | DW | DW | DW | DW | DW |  |  |  |  |  |  |  | DW | DW | DW | DW |  |  |  |  | DW | DW | DW | DW | DW | DW | DW | DW | DW |  |  |
|  | DW | DW | DW | DF | DF | DF | DW | DW |  |  |  |  |  | DW | DW | DF | DF | DW | DW |  |  |  | DW | DF | DF | DF | DW | DF | DF | DF | DW | DW |  |
| DW | DW | DF | DF | DF | DF | DF | DF | DW |  |  |  |  | DW | DW | DF | DF | DF | DF | DW | DW | DW |  | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW |  |
| DW | DF | DF | DF | DF | DF | DF | DF | DW |  | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW |  |
| DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DW | DW | DW |  |  |
| DW | DW | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DW | DW | DW | DF | DF | DW | DW |  |  |  |  |
|  | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DW | DW | DW | DF | DF | DF | DF | DF | DW | DF | DF | DF | DW | DW | DW |  |  |
|  |  | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW | DF | DW | DW | DW | DF | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |  |
|  |  | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW | DF | DW | DF | DW | DF | DW | DW |  |  | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |  |
|  |  |  |  | DW | DW | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DW | DW |  |  | DW | DW | DW | DW | DF | DF | DF | DF | DW | DW |  |  |
|  |  |  |  | DW | DW | DF | DF | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DW |  | DW | DW | DF | DW | DW | DW | DW | DF | DF | DW | DW |  |  |
|  |  |  |  | DW | DF | DF | DF | DW | DW | DF | DW | DW | DW | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DW | DW | DF | DF | DF | DW | DW |  |
|  |  |  | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DW | DW | DF | DW | DW | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW |  |
|  |  |  | DW | DF | DF | DF | DW | DW | DW | DF | DF | DW | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DW | DW |
|  |  | DW | DW | DF | DF | DW | DW | DW | DF | DF | DF | DF | DW | DW | DW | DW | DF | DW | DF | DW | DW | DW | DW | DF | DW | DW | DW | DW | DF | DF | DF | DF | DW |
|  |  | DW | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DW |
|  | DW | DW | DF | DF | DW | DW | DF | DW | DW | DW | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW |
| DW | DW | DF | DF | DF | DW | DF | DF | DF | DW | DW | DW | DW |  | DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DW | DW | DW | DW | DF | DF | DW | DW |  |
| DW | DF | DF | DF | DW | DW | DF | DF | DF | DW |  |  |  |  | DW | DW | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DW |  |
| DW | DF | DF | DF | DW | DW | DW | DF | DW | DW |  | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DW | DW | DF | DF | DF | DW | DW |  |
| DW | DW | DF | DF | DW | DW | DW | DF | DW | DW | DW | DW | DF | DF | DW | DW | DF | DF | DF | DW | DW | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DW |  |  |
|  | DW | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DW | DW | DW | DW | DF | DW | DF | DF | DW | DW | DF | DF | DF | DW |  |  |
|  | DW | DW | DF | DF | DF | DW | DW | DF | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW | DW | DF | DF | DF | DW | DW |  |  |
|  |  | DW | DF | DF | DF | DF | DW | DF | DW | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW | DF | DW | DW | DW | DF | DF | DF | DW | DW |  |  |  |
|  |  | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DW | DW |  |  |  |  |
|  |  | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW | DW |  |  |  |
|  | DW | DW | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DW | DW | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DW | DF | DF | DF | DF | DW | DW |  |  |
|  | DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DW | DW | DF | DW | DW | DW | DF | DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DW | DW |  |
|  | DW | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DW | DF | DW | DW | DW | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW |
| DW | DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DW | DW |  | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW |  | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW |
| DW | DF | DF | DF | DF | DW | DW |  |  |  |  | DW | DW | DW | DF | DW | DEN | DW | DF | DW | DW |  |  |  | DW | DW | DF | DF | DF | DF | DF | DW | DW |  |
| DW | DW | DF | DF | DW | DW |  |  |  |  |  |  |  | DW | DW | DW | DW | DW | DW | DW |  |  |  |  |  | DW | DW | DF | DW | DF | DW | DW |  |  |
|  | DW | DW | DW | DW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | DW | DW | DW | DW | DW |  |  |  |

## cave\_2 (Klassik)

- Organische Form der Räume
- Es gibt Räume, die nur durch einen Weg zu erreichen sind und andere die durch mehrere erreichbar sind
- Zwischengänge können sichtbar sein oder versteckte Wände

### Beispiel 1

|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  | DW | DW | DW | DW | DW | DW |  |  |  |  |  | DW | DEN | DW |  |  |  |  |  |  |  |  |  |  |  |  | DW |
| DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DW |  |  |  |  |  | DW | DF | DW | DW |  |  |  |  |  |  |  | DW | DW | DW | DW | DW |
| DW | DF | DF | DW | DW | DF | DF | DF | DW | DW | DF | DW | DW | DW | DW | DW | DW | DF | DF | DF | DW | DW | DW | DW | DW |  | DW | DW | DW | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DW | DW |
| DW | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW |
| DW | DW | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW |  |  | DW | DF | DF | DW | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DW |
| DW | DW | DF | DF | DW | DW | DW | DW | DW | DF | DF | DF | DF | DW | DW |  |  | DW | DW | DF | DF | DW | DF | DF | DW | DW | DW | DW | DW | DW | DF | DW | DW |
|  | DW | DW | DF | DW | DF | DF | DW | DW | DW | DF | DF | DW | DW |  |  |  | DW | DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DF | DW | DW |
|  |  | DW | DW | DW | DF | DW | DW |  | DW | DF | DW | DW |  |  |  | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DW |
|  |  | DW | DW | DW | DF | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DF | DF | DW | DW | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DW |
|  | DW | DW | DF | DF | DF | DF | DW | DW | DF | DF | DF | DW | DW | DF | DF | DF | DF | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW | DW |
| DW | DW | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW |  | DW | DF | DW |  | DW | DW | DF | DF | DW | DW | DW |  |
| DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DW | DW | DW | DF | DW |  | DW | DF | DF | DF | DF | DF | DW |  |
| DW | DW | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |  | DW | DF | DF | DF | DF | DF | DW |  |
|  | DW | DW | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DW | DW | DW | DW | DW |  | DW | DW | DF | DF | DF | DW | DW |  |
|  |  | DW | DF | DW | DW |  | DW | DF | DF | DF | DF | DF | DW | DW | DW | DW | DF | DW | DW | DW | DW | DF | DW | DW |  | DW | DW | DF | DF | DW |  |  |
|  | DW | DW | DF | DW | DW |  | DW | DF | DW | DW | DF | DF | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DW | DW | DW | DW | DF | DW | DW |  |  |
|  | DW | DF | DF | DF | DW | DW | DW | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DW |  |  |  |
|  | DW | DW | DW | DW | DW | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DF | DW | DW | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DW | DW | DW | DW |
|  | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |  | DW | DW | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |
| DW | DW | DF | DF | DF | DF | DW | DW | DF | DF | DF | DW |  | DW | DW | DF | DF | DF | DW | DW | DF | DF | DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW |
| DW | DF | DF | DF | DF | DW | DW | DW | DW | DF | DW | DW | DW | DW | DF | DF | DF | DF | DW | DW | DW | DW | DW | DF | DW | DW | DF | DF | DF | DW |  |  |  |
| DW | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DW | DW | DF | DF | DF | DF | DW | DW |  | DW | DW | DF | DF | DW | DW | DW | DF | DF | DW |  |  |  |
| DW | DW | DF | DF | DF | DW | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DW | DW |  | DW | DW | DF | DW |  |  |  |
|  | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DW |  |  |  | DW | DF | DW |  |  |  |
|  |  | DW | DW | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW |  |  | DW | DF | DW | DW | DW |  |
|  |  |  | DW | DW | DF | DF | DW | DW |  |  | DW | DW | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DW |  |  | DW | DF | DF | DF | DW | DW |
|  | DW | DW | DW | DF | DF | DF | DW | DW |  |  | DW | DW | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DF | DF | DF | DW |
| DW | DW | DF | DF | DF | DF | DF | DF | DW |  |  | DW | DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DW | DW |
| DW | DF | DF | DF | DF | DF | DF | DF | DW |  |  | DW | DF | DF | DF | DW | DW | DF | DF | DF | DW | DF | DF | DF | DW | DW | DF | DF | DW | DW | DF | DW |  |
| DW | DW | DF | DW | DW | DF | DF | DW | DW |  |  | DW | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DW | DW | DW |  |
|  | DW | DW | DW | DW | DW | DF | DW |  |  |  |  |  |  |  |  |  | DW | DW | DW |  | DW | DW | DW |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  | DW | DW | DW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

## Beispiel 2

|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | DW | DEN | DW | DW | DW | DW | DW |  |  |  |  |  | DW | DW | DW | DW |  |  |
|  |  |  |  |  |  |  |  |  | DW | DW | DW | DW | DW |  | DW | DF | DW | DW | DF | DF | DW |  | DW | DW | DW | DW | DW | DF | DF | DW | DW |  |
|  |  |  | DW | DW | DW |  |  | DW | DW | DF | DF | DF | DW | DW | DW | DF | DW | DW | DF | DW | DW | DW | DW | DF | DW | DW | DF | DF | DF | DF | DW | DW |
|  |  | DW | DW | DF | DW | DW |  | DW | DF | DF | DF | DF | DF | DW | DW | DF | DW | DW | DF | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF |
|  | DW | DW | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DW | DW | DF | DF | DF | DF | DW | DF |
| DW | DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DW | DF | DF | DW | DW | DF | DW | DW | DW | DW | DF | DW | DW | DW | DF | DF | DW | DW | DF |
| DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DW | DW | DW | DF | DW | DW | DW | DF | DW | DW | DW | DF | DF | DF | DW | DW | DW | DW | DW | DF | DF |
| DW | DF | DF | DF | DF | DW | DW | DF | DW | DW | DW | DF | DW | DW | DW | DF | DW | DW | DF | DF | DF | DW | DF | DF | DF | DF | DW |  |  | DW | DF | DF | DF |
| DW | DW | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DW | DF | DF | DF | DW | DW | DW | DW | DW | DW |  | DW | DW | DF | DF | DF |
|  | DW | DW | DW | DW | DF | DF | DF | DW | DW | DF | DW | DW | DW | DF | DF | DF | DW | DW | DF | DW | DW | DW | DW | DF | DF | DW |  | DW | DF | DF | DF | DF |
| DW | DW | DW | DW | DW | DF | DF | DF | DW | DW | DF | DW | DW | DW | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DW | DW | DW |
| DW | DF | DF | DW | DW | DF | DF | DW | DW | DF | DF | DF | DW | DW | DW | DF | DW | DW |  | DW | DW | DF | DF | DF | DF | DF | DF | DW | DW | DF | DW | DW | DW |
| DW | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DW | DW | DW | DF | DW |  | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |
| DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW |  |
|  | DW | DW | DW | DW | DW | DW | DW | DW | DF | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DW |  |  |
|  |  | DW | DW | DW | DW |  | DW | DW | DF | DW | DW | DW | DW | DW | DF | DF | DF | DW | DW | DF | DF | DF | DW | DW | DW | DW | DF | DF | DW | DW |  |  |
|  | DW | DW | DF | DF | DW | DW | DW | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DW | DW | DW | DW | DW |  | DW | DW | DW | DW | DW |  |  |  |
| DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW |  |  | DW | DW | DW | DW | DW | DF | DF | DF | DW |  |  |  |
| DW | DF | DF | DW | DW | DF | DF | DW | DF | DF | DF | DF | DW | DW | DW | DW | DW |  |  | DW | DW | DW | DF | DF | DW | DW | DW | DF | DW | DW |  |  |  |
| DW | DF | DF | DF | DW | DF | DF | DW | DF | DF | DW | DF | DW | DW |  |  |  |  | DW | DW | DF | DF | DF | DF | DF | DW | DW | DF | DW | DW | DW |  |  |
| DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW |  | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW |  |
|  | DW | DW | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DW | DW |
|  | DW | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF |  | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW |
|  | DW | DW | DF | DW | DW | DW |  |  | DW | DW | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DW |
|  |  | DW | DF | DW |  |  |  |  |  | DW | DW | DF | DF | DW | DW | DW | DW | DW |  | DW | DF | DF | DF | DF | DF | DF | DW | DW | DF | DW | DW |  |
|  | DW | DW | DF | DW | DW |  |  |  |  |  | DW | DW | DW | DW | DW | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW | DF | DF | DW | DW |
| DW | DW | DF | DF | DF | DW | DW |  |  |  |  |  |  | DW | DW | DF | DF | DF | DF | DW | DW | DW | DW | DW | DF | DF | DF | DF | DW | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DW | DW | DW | DW | DW | DW | DW | DF | DF | DF | DW | DF | DF | DW |  |  | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW |
| DF | DF | DF | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DW |  |  |  |  | DW | DW | DF | DF | DF | DW | DW | DW |
| DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DW | DW |  |  |  |  | DW | DW | DF | DF | DF | DF | DF | DW |
| DW | DW | DF | DF | DF | DW | DW |  | DW | DW | DW | DF | DF | DF | DW | DF | DF | DW | DW | DW |  |  |  |  | DW | DW | DF | DF | DF | DF | DF | DW | DW |
|  | DW | DW | DF | DW | DW |  |  |  |  | DW | DW | DW | DF | DF | DF | DW | DW |  |  |  |  |  |  | DW | DF | DF | DF | DW | DF | DW | DW |  |
|  |  | DW | DW | DW |  |  |  |  |  |  |  | DW | DW | DF | DW | DW |  |  |  |  |  |  |  | DW | DF | DF | DW | DW | DW | DW |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  | DW | DW | DW |  |  |  |  |  |  |  |  | DW | DW | DW | DW |  |  |  |  |  |

## cave\_3 (Große Höhle)

- Organische Form der Räume
- Räume sind nur über einen Weg zur erreichen
- Die Räume können einzelne oder mehrere Fellsmauerfelder in sich haben

|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  | DW | DW | DW | DW | DW |  |  |  |  | DW | DW | DW |  |  |  |  |  |  |  |  |  |  | DW | DW | DW | DW |  |  |  |  |  |
|  |  | DW | DF | DW | DF | DW | DW |  |  | DW | DW | DEN | DW | DW |  |  |  |  |  |  |  |  | DW | DW | DF | DF | DW | DW | DW |  |  |  |
|  | DW | DF | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DW | DW |  |  |  |  |  | DW | DW | DW | DF | DF | DF | DF | DF | DW | DW |  |  |
| DW | DW | DF | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DW | DW |  |  |  | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW |  |
| DW | DF | DF | DW | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW |  | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |
| DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DW | DF | DF | DF | DW |  |
| DW | DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DW | DW | DW | DF | DF | DW | DW |
| DW | DW | DF | DF | DW | DF | DF | DW |  | DW | DW | DF | DW | DW |  | DW | DW | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DW | DF | DF | DF | DF | DW |
| DW | DF | DF | DF | DF | DF | DW | DW |  | DW | DF | DF | DF | DW | DW | DW | DF | DF | DF | DW | DW |  | DW | DF | DF | DF | DF | DW | DW | DF | DF | DF | DW |
| DW | DF | DF | DW | DF | DF | DW | DW |  | DW | DF | DF | DF | DF | DW | DW | DW | DF | DF | DW |  | DW | DW | DW | DF | DF | DF | DF | DW | DF | DF | DW | DW |
| DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DW | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW |  |
| DW | DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DW | DF | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DW | DF | DW | DW |  |  |
|  | DW | DW | DF | DW | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DW | DF | DW | DW | DW | DW |  |  |  |
|  |  | DW | DF | DW | DW | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DW | DW | DF | DF | DF | DW | DW | DW | DF | DW |  |  |  |  |  |  |
|  |  | DW | DF | DW | DW | DW | DW | DF | DF | DF | DW | DW | DF | DF | DF | DF | DW | DW | DF | DF | DW | DW |  | DW | DF | DW |  |  |  |  |  |  |
|  |  | DW | DF | DW | DW |  | DW | DW | DF | DF | DF | DW | DF | DF | DF | DW | DW | DF | DF | DF | DW |  |  | DW | DF | DW |  |  |  |  |  |  |
|  |  | DW | DF | DF | DW |  |  | DW | DW | DF | DF | DW | DW | DF | DW | DW | DF | DF | DF | DW | DW |  | DW | DW | DF | DW |  |  |  |  |  |  |
|  |  | DW | DW | DF | DW |  |  |  | DW | DF | DF | DF | DW | DF | DW | DF | DF | DW | DW | DW |  |  | DW | DF | DF | DW |  |  |  |  |  |  |
|  | DW | DW | DW | DF | DW |  |  |  | DW | DW | DF | DF | DF | DF | DF | DF | DW | DW |  |  |  |  | DW | DF | DW | DW |  |  |  |  |  |  |
|  | DW | DF | DF | DF | DW |  |  |  |  | DW | DW | DF | DF | DF | DF | DW | DW |  |  |  |  |  | DW | DF | DF | DW |  |  |  |  |  |  |
|  | DW | DF | DW | DW | DW |  |  |  |  |  | DW | DF | DF | DF | DF | DW |  |  |  |  |  |  | DW | DW | DF | DW |  |  |  |  |  |  |
|  | DW | DF | DW | DW |  |  |  |  |  |  | DW | DW | DF | DF | DW | DW |  |  |  |  |  |  |  | DW | DF | DW |  |  |  |  |  |  |
|  | DW | DF | DF | DW |  |  |  |  |  |  |  | DW | DF | DF | DW |  |  |  |  |  |  |  | DW | DW | DF | DW |  |  |  |  |  |  |
|  | DW | DW | DF | DW |  |  |  |  |  |  | DW | DW | DF | DF | DW |  |  |  |  |  |  |  | DW | DF | DF | DW |  |  |  |  |  |  |
|  |  | DW | DF | DW |  |  |  |  |  | DW | DW | DF | DF | DF | DW | DW |  |  |  |  |  |  | DW | DF | DW | DW |  |  |  |  |  |  |
|  |  | DW | DF | DW | DW | DW |  |  |  | DW | DF | DF | DF | DF | DF | DW | DW | DW |  |  |  | DW | DW | DF | DW | DW | DW |  |  |  |  |  |
|  |  | DW | DF | DF | DF | DW | DW |  | DW | DW | DF | DF | DW | DW | DF | DF | DF | DW |  |  | DW | DW | DF | DF | DF | DF | DW | DW | DW |  |  |  |
|  | DW | DW | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DW | DF | DF | DF | DW |  |  | DW | DF | DF | DF | DF | DF | DF | DF | DW |  |  |  |
| DW | DW | DF | DF | DF | DF | DF | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW | DW |  |  | DW | DW | DF | DF | DF | DF | DF | DF | DW |  |  |  |
| DW | DF | DF | DF | DF | DF | DW | DW | DW | DF | DF | DF | DF | DF | DF | DF | DF | DW |  |  |  | DW | DW | DF | DF | DF | DF | DF | DW | DW |  |  |  |
| DW | DF | DF | DF | DF | DF | DW |  | DW | DW | DF | DF | DF | DF | DF | DF | DW | DW |  |  |  | DW | DF | DF | DF | DF | DF | DW | DW |  |  |  |  |
| DW | DW | DF | DF | DF | DW | DW |  |  | DW | DW | DF | DF | DF | DF | DW | DW |  |  |  |  | DW | DW | DW | DF | DF | DF | DW |  |  |  |  |  |
|  | DW | DW | DF | DW | DW |  |  |  |  | DW | DW | DF | DF | DW | DW |  |  |  |  |  |  |  | DW | DW | DF | DW | DW |  |  |  |  |  |
|  |  | DW | DW | DW |  |  |  |  |  |  | DW | DW | DW | DW |  |  |  |  |  |  |  |  |  | DW | DW | DW |  |  |  |  |  |  |

## castle\_1

- Es gibt genau 3 Schlösser auf der Welt, die durch die Banner identifiziert werden können: gut (ID103), neutral (ID104), evil (ID105)
- Es wird je ein Schloss auf der L2, L3 und L4 Insel verteilt
- Der König steht immer vor dem Thron
- Im Außenbereich sind Truhen verteilt, deren Loot immer 1 Level höher ist als das Schloss und doppelt so hoch. Der Spieler erhält vor dem Öffnen eine Warnmeldung, ob er diese wirklich knacken möchte. Entscheidet er sich dafür, ertönt der Alarm und 10-20 **leichte Wachen** werden im Außenbereich des gesamten Schlosses gespawnt. Dieses erfolgt nur einmalig (nicht mehr bei weiteren Truhen im Außenbereich)
- Im Raum des Königs stehen stets 2 Truhen, beide mit 5mio Gold. Um diese zu öffnen muss man zuerst das Codewort von den Statuen herausfinden (> quest\_6). Danach erhält der Spieler eine Information, dass ein Alarmton ertönt und die **schweren Wachen** spawnen zwischen Thronsaal und Ausgang. Danach ist die Truhe regulär freigegeben und kann nach erfolgreicher "Schlösser knacken" Probe geöffnet werden.
- Leichte Wachen entsprechen dem Level des Schlosses, schwere Wachen dem Level des Schlosses +1. Sollte es kein entsprechendes Monster des richtigen Typs für das Level geben, wird das nächst höhere Monster genommen. Es wird für beide Wachen jeweils 1 Monster bestimmt (d.h. pro Schloss gibt es genau 2 verschiedene Monster IDs)
- Die Statuen, König, Wachen & der Thron unterscheiden sich je nach gut/neutral/bösem Schloss. Es wird kommt nur ein Statuetyp pro Schloss vor
- gut
- Statuen: ID28 oder ID27
- Thron: ID30
- König: ID58
- Wachen Monstertyp: humanoid
- neutral
- Statuen: ID95 oder ID61
- Thron: ID30
- König: ID59
- Wachen Monstertyp: magical\_construct
- böse:
- Statuen: ID34 oder ID95
- Thron: ID6
- König: ID60
- Wachen Monstertyp: undead,
- Die Banner müssen in regelmäßigen Abständen (2-4 Felder auseinander) gesetzt werden
- Sämtliche Bewegungszauber der Party (Jump, Teleport, Portale, Lloyd's Leuchtfeuer) funktionieren nicht ("The castle seems to be magically protected against movement spells.")

## Beispiel 1

| FW | FW | FW | FW | FW |  |  |  |  |  |  | FW | FW | FW | FW | FW |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FW | FF | FF | FF | FW |  | FW | FW | FW | FW |  | FW | FF | FF | FF | FW |
| FW | FF | ST | FF | FW | FW | FW | FF | FF | FW | FW | FW | FF | ST | FF | FW |
| FW | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FW |
| FW | FW | FW | FF | FW | FF | FW | FW | FW | FW | FW | FW | FF | FW | FW | FW |
|  |  | FW | FF | FW | FW | FW | FF | FW | FF | FF | FW | FF | FW | FF | FW |
|  | FW | FW | FF | FW | FW | FF | FF | FW | FW | FF | FW | FF | FF | FF | FW |
|  | FW | FF | FF | FW | TH | FF | FF | FF | FF | FF | FF | FF | FF | FF | FD |
|  | FW | FW | FF | FW | FW | FF | FF | FW | FW | FF | FW | FF | FF | FF | FW |
|  |  | FW | FF | FW | FW | FW | FF | FW | FF | FF | FW | FF | FW | FF | FW |
| FW | FW | FW | FF | FW |  | FW | FW | FW | FW | FW | FW | FF | FW | FW | FW |
| FW | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FW |
| FW | FF | ST | FF | FW | FW | FW | FF | FF | FW | FW | FW | FF | ST | FF | FW |
| FW | FF | FF | FF | FW |  | FW | FW | FW | FW |  | FW | FF | FF | FF | FW |
| FW | FW | FW | FW | FW |  |  |  |  |  |  | FW | FW | FW | FW | FW |

## Beispiel 2

| FW | FW | FW | FW | FW |  |  |  |  |  |  |  |  |  | FW | FW | FW | FW | FW |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FW | FF | FF | FF | FW |  |  |  |  |  |  |  |  |  | FW | FF | FF | FF | FW |
| FW | FF | ST | FF | FW | FW | FW | FW | FW | FW | FW | FW | FW | FW | FW | FF | ST | FF | FW |
| FW | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FW |
| FW | FW | FW | FF | FW | FF | FW | FF | FW | FF | FW | FF | FW | FF | FW | FF | FW | FW | FW |
|  |  | FW | FF | FW | FW | FW | FW | FW | FW | FW | FW | FW | FW | FW | FF | FW |  |  |
|  |  | FW | FF | FW | FW | FW | FW | FF | TH | FF | FW | FW | FW | FW | FF | FW |  |  |
|  |  | FW | FF | FF | FF | FF | FW | FF | FF | FF | FW | FF | FF | FF | FF | FW |  |  |
|  |  | FW | FF | FW | FW | FF | FW | FW | FF | FW | FW | FF | FW | FW | FF | FW |  |  |
|  |  | FW | FF | FW | FF | FF | FF | FW | FF | FW | FF | FF | FF | FW | FF | FW |  |  |
|  |  | FW | FF | FW | FF | FF | FF | FW | FF | FW | FF | FF | FF | FW | FF | FW |  |  |
|  |  | FW | FF | FW | FW | FW | FW | FW | FF | FW | FW | FW | FW | FW | FF | FW |  |  |
|  |  | FW | FF | FW | FW | FF | FF | FF | FF | FF | FF | FF | FW | FW | FF | FW |  |  |
|  |  | FW | FF | FW | FW | FW | FW | FW | FF | FW | FW | FW | FW | FW | FF | FW |  |  |
| FW | FW | FW | FF | FW | FW | FW | FW | FW | FF | FW | FW | FW | FW | FW | FF | FW | FW | FW |
| FW | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FF | FW |
| FW | FF | ST | FF | FW | FW | FW | FW | FW | FD | FW | FW | FW | FW | FW | FF | ST | FF | FW |
| FW | FF | FF | FF | FW |  |  |  |  |  |  |  |  |  | FW | FF | FF | FF | FW |
| FW | FW | FW | FW | FW |  |  |  |  |  |  |  |  |  | FW | FW | FW | FW | FW |

## spaceship\_1

- Im Spaceship funktionieren keine Teleportationsprüchen wie Teleport, Ätherisieren, Sprung oder sonstige Portale ("Something in this strange construct is preventing you to cast <name\_of\_spell>.")
- Funktionale & Dekoobjekte:
- Power source crystal (ID67): Wird als funktionales Objekt in quest\_7 verwendet
- Computer (ID68): Kann als Deko Informationen geben oder funktional (z.B. für Quest)
- Rewards: in jeder Sektion außer der "Bridge" 2 "Orb of ultimate power" (ID109, s. Loot). Zusätzlich sind Kelche (ID86) mit 1-2 mio XP möglich.
- Es gibt keine 90° Ecken, sondern nur Rundungen (innere und äußere Rundungen)
- Das Spaceship ist ein großes zusammenhänges Level, welches aus 5 Sektionen besteht (Keycards ID65-66, ID122-124). Teile das generierte Spaceshiplevel in 5 gleich große Sektionen ein, die du mit Schleusen voneinander trennst. Die "Bridge" ist immer vorne (im Beispiel unten ganz links). In ihr steht zentral die Spaceship Console, durch die der Spieler (wenn Life Support und Engines laufen und er die schwarze Keycard hat) das Spiel beenden kann (Abspann "..\\old\_code\\resources\\movies\\Game Outro.mp4")
- Zugang zu einer Sektion erfolgt durch eine Pyramide auf der Außenwelt (d.h. es müssen immer 5 Pyramiden vorhanden sein - diese müssen möglichst gleichmäßig über die Inseln verteilt sein und dürfen auf jeder Insel stehen). Welche Pyramide zu welcher Sektion gehört, ist zufällig; nur die Pyramide zur "Bridge" muss auf einem schweren L5-Territory stehen. Im Spaceship ist der Ein/Ausgang die Transporter Tube ID40, die an der Wand aber auch mitten im Raum stehen darf
- Initial sind die Sektionen voneinander durch Schleusen getrennt (die Grafik existiert noch nicht, nutze einen Dummy). Auf beiden Seiten der Schleuse gibt es Hebel (ID39):
- Initialer Text "A small sign next to the level reads 'Manual lock override.' Would you like to switch the lever"
- Wenn der 1. Hebel umgelegt wird (der auf der anderen Seite noch nicht): "You hear a buzz and afterwards mechanical noises. However the lock still stands in place."
- Wenn  der 2. Hebel auch umgelegt wird: "You hear a buzz and afterwards mechanical noises and you see how the heavy lock slowly opens." > den Block "Schleuse" entfernen
- Ein Hebel kann nur aktiviert werden. Wenn man versucht ihn erneut zu ziehen: "You pull as hard as you can, but the lever is stuck in its place."

|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  | CW | CW | CW | CW |  |  |  |  |  |  |  |  |  |  |  |  | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | CW | CW | CW |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  | CW | CI3 | CI4 | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CO3 | CF | CO4 | CO3 | CF | CO4 | CO3 | CF | CO4 | CO3 | CF | CO4 | CO3 | CF | CO4 | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CI3 | CF | CI4 | CW | CW | CW | CW | CW | CW |  |
|  |  |  | CW | CW | CW |  |  | CW | CI2 | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CI4 | CW | CF | CF | CF | CI4 | CW | CW | CI3 | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CW | CI3 | CF | CF | CF | CI4 | CW |
|  |  | CW | CI3 | CF | CI4 | CW | CW | CW | CW | CW | CW | CW | CW | CF | CF | CF | CI1 | CW | CO2 | CF | CW | CW | CW | CO2 | CF | CO1 | CO2 | CF | CO1 | CO2 | CF | CO1 | CO2 | CF | CO1 | CO2 | CF | CO1 | CW | CW | CW | CW | CW | CW | CO2 | CF | CW | CF | CW | CF | CI1 | CW | CW | CF | CO1 | CW | CW | CW | CW | CW | CW | CW | CW | CF | CW | CW | CF | CF | CF | CF | CF | CW |
|  |  | CW | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CO1 | CW |  | CW | CF | CF | CW |  | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CI3 | CF | CF | CO4 | CW | CW | CF | CW | CF | CW | CW | CW | CW | CO3 | CF | CW | CW |  |  |  |  |  | CW | CF | CF | CF | CF | CF | CF | CF | CF | CF | CW |
|  |  | CW | CI2 | CF | CI1 | CW | CW | CW | CW | CW | CO2 | CF | CF | CF | CI1 | CW | CW |  | CW | CF | CW | CW |  | CW | CW | CW | CW | CW | CW | CW | CW | CW |  |  |  |  |  |  | CW | CI2 | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CI1 | CW |  | CW | CW | CW | CW | CW |  | CW | CF | CO1 | CW | CI2 | CF | CF | CF | CI1 | CW |
|  |  |  | CW | CW | CW | CW | CI3 | CI4 | CW | CW | CO3 | CF | CF | CO1 | CW | CW | CW | CW | CO3 | CF | CF | CW | CW | CI3 | CF | CF | CF | CF | CF | CF | CF | CF | CW | CW | CW | CW | CW | CW |  | CW | CW | CW | CW | CW | CW | CF | CF | CF | CW | CW | CW | CW | CW | CW |  | CW | CI3 | CF | CF | CF | CI4 | CW | CW | CF | CW | CW | CW | CW | CW | CW | CW |  |
|  |  | CW | CI3 | CI4 | CW | CW | CI2 | CF | CF | CF | CF | CF | CF | CW | CW | CF | CF | CF | CF | CF | CO1 | CW | CW | CF | CO1 | CW | CW | CW | CW | CW | CW | CW | CW | CI3 | CF | CF | CF | CF | CW | CW | CI3 | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CW |  | CW | CF | CF | CF | CF | CF | CW | CW | CF | CO4 | CW | CI3 | CI4 | CW | CW | CW |  |
|  | CW | CO3 | CF | CF | CO4 | CW | CW | CW | CW | CF | CF | CF | CI1 | CW | CW | CI2 | CF | CW | CO2 | CF | CO4 | CW | CW | CF | CO4 | CW | CO3 | CF | CO4 | CW | CW | CW | CO3 | CF | CF | CF | CF | CW |  | CW | CF | CW | CW | CW | CW | CF | CW | CF | CW | CW | CW | CW | CF | CW |  | CW | CF | CF | CF | CF | CF | CW | CI3 | CF | CF | CF | CF | CF | CW | CF | CF | CW |
| CW | CI3 | CF | CF | CF | CF | CF | CF | CF | CF | CF | CO1 | CW | CW |  | CW | CW | CW | CW | CW | CF | CF | CI4 | CW | CI2 | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CW | CW | CF | CW | CI3 | CI4 | CW | CF | CW | CF | CO4 | CW | CW | CI3 | CF | CI4 | CW | CW | CF | CF | CF | CF | CF | CW | CF | CF | CO1 | CW | CI2 | CI1 | CW | CF | CF | CW |
| CW | CI2 | CF | CF | CF | CF | CF | CF | CF | CF | CF | CO4 | CW | CW |  |  | CW | CW | CW | CW | CF | CF | CI1 | CW | CW | CW | CW | CF | CF | CF | CW | CW | CW | CO2 | CF | CF | CF | CF | CW |  | CW | CF | CW | CF | CF | CF | CF | CW | CF | CF | CI4 | CW | CF | CF | CF | CW | CW | CI2 | CF | CF | CF | CI1 | CW | CI2 | CF | CO4 | CW | CW | CW |  | CW | CW |  |
|  | CW | CO2 | CF | CF | CO1 | CW | CW | CW | CW | CF | CF | CF | CI4 | CW | CW | CF | CI4 | CW | CO3 | CF | CO1 | CW | CW | CI3 | CF | CF | CF | CF | CF | CF | CF | CI4 | CW | CI2 | CF | CF | CF | CF | CW | CW | CF | CW | CI2 | CF | CF | CI1 | CW | CF | CF | CI1 | CW | CI2 | CF | CI1 | CW |  | CW | CO2 | CF | CO1 | CW |  | CW | CF | CF | CW | CW | CW |  | CW | CW |  |
|  |  | CW | CI2 | CI1 | CW | CW | CI3 | CF | CF | CF | CF | CF | CF | CW | CW | CF | CF | CF | CF | CF | CO4 | CW | CW | CF | CO1 | CW | CO2 | CF | CO1 | CW | CO2 | CF | CW | CW | CW | CW | CW | CW |  |  | CW |  | CW | CW | CW | CW |  | CW | CW | CW |  | CW | CW | CW |  |  |  | CW | CF | CW |  |  | CW | CF | CF | CW | CW | CW | CW | CW | CW |  |
|  |  |  | CW | CW | CW | CW | CI2 | CI1 | CW | CW | CO2 | CF | CF | CO4 | CW | CW | CW | CW | CO2 | CF | CF | CW | CW | CF | CW | CW | CW | CW | CW |  | CW | CF | CW | CW | CW | CW | CW | CW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | CW | CI3 | CF | CI4 | CW |  | CW | CF | CO1 | CW | CI3 | CF | CF | CF | CI4 | CW |
|  |  | CW | CI3 | CF | CI4 | CW | CW | CW | CW | CW | CO3 | CF | CF | CF | CI4 | CW | CW |  | CW | CF | CW | CW | CW | CF | CO4 | CO3 | CF | CI4 | CW | CW | CO3 | CF | CO4 | CO3 | CF | CF | CF | CI4 | CW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | CW | CF | CF | CF | CW |  | CW | CF | CO4 | CW | CF | CF | CF | CF | CF | CW |
|  |  | CW | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CO4 | CW |  | CW | CF | CF | CW | CW | CF | CF | CF | CF | CF | CW | CI3 | CF | CF | CF | CF | CF | CF | CF | CI1 | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW |  |  |  | CW | CF | CW |  | CW | CF | CF | CF | CF | CF | CF | CF | CF | CF | CW |
|  |  | CW | CI2 | CF | CI1 | CW | CW | CW | CW | CW | CW | CW | CW | CF | CF | CF | CI4 | CW | CO3 | CF | CW | CW | CW | CF | CF | CF | CF | CF | CW | CF | CF | CF | CW | CW | CW | CW | CW | CW | CW | CO3 | CF | CO4 | CO3 | CF | CO4 | CO3 | CF | CO4 | CO3 | CF | CO4 | CO3 | CF | CO4 | CW | CW | CW | CO3 | CF | CO4 | CW | CW | CW | CF | CW | CW | CF | CF | CF | CF | CF | CW |
|  |  |  | CW | CW | CW |  |  | CW | CI3 | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CI1 | CW |  | CW | CI2 | CF | CF | CF | CI1 | CW | CI2 | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CF | CW | CI2 | CF | CF | CF | CI1 | CW |
|  |  |  |  |  |  |  |  | CW | CI2 | CI1 | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW |  |  | CW | CW | CW | CW | CW |  | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW | CW |  |
|  |  |  |  |  |  |  |  | CW | CW | CW | CW |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

### Anordnung der 5 Sektionen

\-Die "Bridge" ist immer vorne mit Schleuse zum "Control Room". Dahinter kommen die Sektionen "Control Room" und "Life Support" nebeneinander. Sie sind mit einer Schleuse verbunden

- Dahinter kommt die "Storage Bay", die mit einer Schleuse mit dem "Control Room" verbunden ist
- Am Ende der "Engine Room", der durch eine Schleuse mit der "Storage Bay" verbunden ist
- Es gibt also 4 Schleusen: Bridge - Control Room, Control Room - Life Support, Control Room - Storage Bay, Storage Bay - Engine Room

|  |  |  |  |
| --- | --- | --- | --- |
| Bridge | Control Room | Storage Bay | Engine Room |
|  | Life Support |  |  |

End-Räume

## Goldene Regeln

- End-Räume von L1 & 2 haben, je nach Welt Größe, 0-3 Schlüssel, um in L3-5 Level zu kommen (alle in der Welt benötigten Schlüssel müssen in L1/2 End-Räumen (Dungeons & Caves) **offensichtlich** zu finden sein (z.B. rotierender Schlüssel ID17-25).
- Dungeon End-Räume von L4 & 5 haben, je nach Welt Größe, 0-3 Key Card, um in die Spaceship Level zu kommen (alle in der Welt benötigten Schlüssel müssen in L4/5 End-Räumen **offensichtlich** zu finden sein (z.B. rotierender Keycards ID65-66, ID122-124).
- Key Cards sind nur in Dungeons (Türmen) zu finden, die einen Schlüssel zum Öffnen benötigen
- Cave End-Räume von L4 & 5 haben nur Loot (ohne Key Card)

## Loot

Die fett geschriebenen Punkte müssen immer dabei sein. Wähle **zusätzlich** zufällig 2-4 Belohnungen aus. Die Schätze im Endraum sind immer 1 Level höher als das Level (z.B. Dungeon L3 > Treasure L4)

| Level | Loot |
| --- | --- |
| \- 1 | \- 5-10k Gold<br>\- 5 Attributspunkte (von zufälligem Typ)<br>\- 5-10 x Treasure L2<br>\- L1 Spell<br>**\- Schlüssel (s. Goldene Regeln)** |
| \- 2 | \- 10-50k Gold<br>\- 10 Attributspunkte (von zufälligem Typ), bzw. 5 Resistenzpunkte<br>\- 5-10 x Treasure L3<br>\- L2 Spell<br>**\- Schlüssel (s. Goldene Regeln)** |
| 3 | \- 50 - 200 k Gold<br>\- 15 Attributspunkte (von zufälligem Typ), bzw. 7 Resistenzpunkte<br>\- 5-10 x Treasure L4<br>\- 0-2 L3 Spells |
| \- 4 | \- 200-1000 k Gold (auf 100k gerundet)<br>\- 20 Attributspunkte (von zufälligem Typ), bzw. 10 Resistenzpunkte<br>\- 500k, 750k oder 1 mio XP<br>\- 5-10 x Treasure L5<br>\- 4 Spells<br>**\- Key Card (s. Goldene Regeln)** |
| 5 | \- 1-2 mio Gold (auf 250k gerundet)<br>\- Levelaufstieg (+1 Level)<br>\- L5 Spell<br>\- Eine zufällige Resistenz beim schwächsten Charakter auf einen Basiswert von 20 bringen. Als Objekt den Kristall nutzen. Automatische Charakterwahl. Haben alle Charaktere den zufällig gewählten Resistenzwert schon bei >=20 passiert nichts ("The glowing crystal does not seem to have an effect on you.")<br>**\- Key Card (s. Goldene Regeln)<br>\- Orb of ultimate power: 2 Orbs pro Sektion im Spaceship, außer in der Bridge (2x4 = 8). Die anderen 23 Orbs auf die L5 Dungeon möglichst gleichmäßig verteilen (hängt von der Kartengröße ab -> daher kann es auch vorkommen, dass kein Orb in einem L5 Dungeon zu finden ist)** |

# Referenzen

Unter "..\\old\_code\\" findest mein Originalspiel. "g.py" enthält die Grunddaten des Spiels (inkl. Pfade zu Texturen)
