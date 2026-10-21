# Dungeon-Themes für generierte Level

Stand: 2026-10-18. Katalog der Dungeon-Themes des Altspiels als Vorlage für den Generator (`src/interiors`, `src/data/rules/*.json`).
Dieses Dokument beschreibt **Inhalt und Logik**, nicht Code. Umgesetzt ist es seit `GEN_VERSION` 9: Abschnitt 9 sagt, was im Generator steht, was nicht und wo es liegt.

**Quellen und Belegstufen**

| Kürzel | Quelle | Wofür |
|---|---|---|
| **[Karte]** | die 34 Kampagnenkarten `public/assets/campaign/*.json` (Export von `old_code/resources/maps/*.map`), Tabellen `src/data/raw/*.json` | Monster, Fallen, Props (Item-IDs), Aktionen, Belohnungen, Schlüsselkette. Maßgeblich. |
| **[Guide]** | Corlagons Walkthrough zu *Might and Magic III* (GameFAQs, **deutsche DOS-Version**, `game/.ignore/walkthrough.txt`) | Rätsellösungen, Schlüssel- und Pyramidenhinweise des Originals. Levelnamen dort deutsch (Spinnenhöhle = Arachnoid Cavern). |
| **[Entwurf]** | Vorschlag dieses Dokuments | Alles, was weder Karte noch Guide hergeben. Muss der Nutzer bestätigen. |

Bei Widerspruch zwischen Guide und Karte gilt die Karte (das Remake weicht ab, siehe Abschnitt 7).

---

## 1. Grundregeln

### 1.1 Aufbau eines Themes

Jeder Dungeon hat genau ein Theme mit diesen Feldern:

| Feld | Regel |
|---|---|
| **Monster** | meist 2 bis 4 Typen, die zusammenpassen (gleiche Familie, Abschnitt 3). Der Endgegner (Lord, König, Master) ist ein eigener Typ und zählt als einer der Typen. |
| **Falle** | genau ein Fallentyp oder **keine** (auch „keine“ ist ein Typ): `guillotine` (Beil), `spring` (Speer), `pit` (Grube), `generic` (Feuer-, Eis-, Säure- oder Magiefalle), `steal_gold` (Goldraub). Truhenfallen (`trap_yn` an Schätzen) sind davon getrennt und gehören zum Stil. |
| **Stil** | Props, die zu den Bewohnern passen (Abschnitt 3). Ein Stil ist konsistent oder er ist falsch. |
| **Hauptquest** | fast immer eine. Rätsel, Hebel, Gongs, Buchstaben, Zahlen. Bei kleinen Höhlen darf sie fehlen. |
| **Schlüsselrolle** | eine der vier Klassen aus 1.2. |
| **Belohnung** | Schlüssel/KeyCard nach 1.2, sonst Gold, Truhen (`reward_treasure_level`), Attribute, Zauber, Talent. |

### 1.2 Schlüssel-Logik (harte Regeln, Generator muss sie prüfen)

Es gibt vier Klassen. Jeder generierte Dungeon gehört zu genau einer.

| Klasse | Voraussetzung zum Betreten | Darf als Belohnung enthalten | Darf nie enthalten |
|---|---|---|---|
| **A: frei** | keine | **Schlüssel** (0, 1 oder 2 Farben) | KeyCard |
| **B: Schlüssel-Dungeon** | genau ein Schlüssel einer Farbe | höchstens eine **KeyCard** | Schlüssel |
| **C: Pyramide** | KeyCard | der Eintritt in das Spaceship | – |
| **D: Spaceship** | über die Pyramide | **hohe Belohnung** (Abschnitt 5) | Schlüssel, KeyCard |

Prüfregeln für den Generator (Fehler, wenn verletzt):

1. Klasse A: kein Quest-Item vom Typ `quest_*_keycard` irgendwo im Level.
2. Klasse B: kein Quest-Item vom Typ `quest_key_*` im Level.
3. Klasse D: weder `quest_key_*` noch `quest_*_keycard`.
4. Jeder verlangte Schlüssel liegt in mindestens einem Klasse-A-Dungeon derselben Welt/Insel, jede verlangte KeyCard in mindestens einem Klasse-B-Dungeon. Sonst ist das Spiel unlösbar.
5. Jede Pyramide führt in genau ein Spaceship-Level. Ein Spaceship wird nur über eine Pyramide betreten.
6. Eine Schlüsselfarbe öffnet genau einen Dungeon; Schlüssel werden beim Betreten nicht verbraucht (Karte: `remove_item` leer).
7. Der Item-Typ des gefundenen Schlüssels ist exakt der Typ, den die Tür verlangt (`quest_key_<farbe>`). Siehe Datenfehler Bronze/Orange unten.

**Was die Kampagne daraus macht [Karte]** (Bedingungen aus den Map-Transfers der Karte `Outside`, Fundorte aus den Aktionen der Dungeons):

| Dungeon | Klasse | Voraussetzung | Enthält |
|---|---|---|---|
| Arachnoid Cavern | A | – | Blauer Schlüssel, Oranger Schlüssel (als `quest_key_bronze`, siehe Datenfehler) |
| Cursed Cold Cavern | A | – | Schwarzer Schlüssel |
| Cyclops Cavern | A | – | Grüner Schlüssel, Roter Schlüssel |
| Magic Cavern | A | – | Goldener Schlüssel (im Steinsarg, mit 500.000 Gold) |
| Dragon Cavern, Temple of Moo, Slithercult Stronghold, Cave 01 bis 03 | A | – | kein Schlüssel |
| Cathedral of Carnage | B | blauer Schlüssel | Blaue KeyCard |
| Fortress of Fear | B | oranger Schlüssel | Schwarze KeyCard |
| Halls of Insanity | B | grüner Schlüssel | Braune KeyCard |
| Dark Warriors Keep | B | roter Schlüssel | Grüne KeyCard |
| Maze from Hell | B | goldener Schlüssel | Lila KeyCard |
| Tomb of Terror | B | schwarzer Schlüssel | keine KeyCard („höchstens“ ist erlaubt) |
| Pyramide auf `Outside` (4993/5030) | C | **schwarze KeyCard** | führt nach `Space Ship` |
| Space Ship | D | – | keine Schlüssel, keine KeyCards |

Beobachtungen, die das Dokument nicht glättet:

- In der Kampagne ist **nur die schwarze KeyCard an eine Pyramide gebunden, da noch nicht alle Level existieren.**. Blau, Braun, Grün und Lila liegen in Truhen und Statuen, öffnen später Level, die noch nicht existieren. Für den Generator gilt die Regel „jede KeyCard-Farbe öffnet genau eine Pyramide“ als **[Entwurf]**.
- Der Guide kennt statt Farben **eine goldene Schlüsselkarte (Pyramidenkarte)**, die alle Pyramiden öffnet, und vier Pyramiden (Lagersektor 2, Betaantrieb, Hauptantrieb, Alphaantrieb). Der Zugang zum letzten Abschnitt (Hauptkontrollsektor) braucht dort zusätzlich den Titel „Perfekter Abenteurer“ (Höllenlabyrinth = Maze from Hell) und die blaue Passkarte.
- Der Guide nennt für Fortress of Fear den **„gelben Festungsschlüssel“**. Die Karte nennt ihn **orange**.
- **Datenfehler im Altbestand (Kampagne):** Die Arachnoid Cavern vergibt den orangen Schlüssel als Quest-Item `quest_key_bronze` (Aktion 12, Text „The orange key …“), der Eingang der Fortress of Fear verlangt aber `quest_key_orange`. Beide Typen existieren in `QUEST_ITEMS.json` (Bronze Key und Orange Key), **kein** Level vergibt `quest_key_orange`. Die Fortress of Fear ist in der Kampagne daher mit dem Arachnoid-Schlüssel nicht zu öffnen. Der Fehler steckt schon in `old_code` (`g.py` Zeile 2393 und 2441). Für den Generator gilt: ein Schlüssel hat **einen** Typ, Fundort und Tür müssen denselben nutzen (Prüfregel 7).

---

## 2. Rätsel- und Questbausteine

Aktionen, aus denen die Hauptquests der Karten bestehen (IDs aus `ACTIONS.json`). Ein generierter Dungeon wählt **einen** Baustein als Hauptquest.

| Baustein | Aktion | Wie es in der Kampagne funktioniert | Beispiel |
|---|---|---|---|
| Gongs schlagen | 40 Counter + 9034 Spawn | Jeder Gong zählt hoch (`counter_id`, `target_value`) und lässt **einmal** Monster erscheinen. Bei Zielwert wird die Zielaktion frei. | Arachnoid Cavern |
| Zahlenrätsel über NPCs | 25 Text + 42 Rätsel | Jeder NPC nennt eine Rechenvorschrift, die Antwort ist eine Zahl. | Arachnoid Cavern, Dark Warriors Keep |
| Buchstabenrätsel | 25 Text, 21 Kelche | Buchstaben liegen verteilt (Altäre, Kelche, Knochen) und ergeben ein Wort oder eine Antwort. | Cathedral of Carnage, Whiteshield Dungeon |
| Kopf-Ring-Rätsel | 45 Multi-State, 9039 Copy/Move, 46 Teleport (Item-Prüfung) | Hebel setzen oder entfernen Köpfe auf einem Ring um ein Zentrum; ein Prüfer im Zentrum belohnt ein bestimmtes Muster. Echte Hebel und Dummy-Hebel sehen gleich aus. Siehe 2a.1. | Fortress of Fear |
| Rotationsrätsel | 45 Multi-State (4 Drehungen), 9047 Rotation-Check | Mehrere drehbare Köpfe müssen auf eine Kombination gestellt werden. Siehe 2a.2. | Cathedral of Carnage |
| Einmal-Hebel | 31 One-time lever, 9032 Tür-Öffner, 9033 Fallen-Leger | Ein Hebel öffnet mehrere Gittertore und legt dabei Fallen. Siehe 2a.3. | Wildabar Cavern |
| Sprungfeld | 27 Teleport, 24 Beil | Ein Feld mit Teleportern (sichtbar oder unsichtbar) und Fallen. Der Spieler merkt sich die Stellen und überspringt sie mit den Zaubern Sprung oder Teleport. Siehe 2a.5. | Maze from Hell, Slithercult Stronghold |
| Kartenbild-Rätsel | 42 Rätsel + Grundriss | Der Grundriss eines Raums bildet Ziffern oder Buchstaben, die der Spieler auf der Karte liest und als Antwort oder Rechenwert nutzt. Siehe 2a.6. | Dark Warriors Keep (Zahl 29) |
| Rätselstatue | 22 / 42 Rätsel (`riddle_id` aus `RIDDLES_MASTER.json`) | Richtige Antwort öffnet Weg oder Schatz, falsche teleportiert zurück. | Cursed Cold, Halls of Insanity, Slithercult |
| Koordinatenschatz | 25 Text + 27 Teleport | Hinweise („6 West, 13 South“) führen zu einem Teleportfeld mit Schatz. | Halls of Insanity, Bloodreign Dungeon |
| Schlüssel finden | 12 Find item | Ein Schlüssel schwebt an einem Ort (Runen, Geheimraum). | Arachnoid, Cursed Cold, Cyclops |
| Kampf gegen Endgegner | 9034 Spawn, 26 Monster-Hindernis | Endgegner oder Wächter erscheinen, wenn eine Zelle betreten oder ein Sarg geöffnet wird (Multi-Trigger bzw. Spawn-Aktion). | Tomb of Terror, Fortress of Fear (Mumien-Hinterhalte) |
| Gruppenwerte steigern | 44 Group attribute gain, 21 mit `reward_attribute` | Altäre/Kristalle/Becken heben dauerhaft Attribute oder Resistenzen. | Blistering Heights Cavern, Arachnoid Cavern |
| Mönchs-Questkette | 37 Check quest (Persona Monk) | Brüder Alpha bis Zeta in mehreren Höhlen, am Ende Quatloo-Münze. | Baywatch Cavern, Wildabar Cavern, Arachnoid Cavern |

### 2a. Mechanik-Rätsel im Detail

Die Tabelle oben nennt nur die Aktionen. Die **Mechanik** der Rätsel lässt sich aus den Kartendaten und dem Altcode (`old_code/action_handler.py`) entschlüsseln, weil sie aus Aktionsparametern besteht, nicht aus Skripttext. Was ich entschlüsselt habe und was nicht, steht in 2a.4. Reine Texträtsel (Zahlen, Wörter) kann ich nur lösen, wenn alle Hinweise als Text in den Karten stehen.

#### 2a.1 Kopf-Ring-Rätsel (Fortress of Fear)

**Idee:** Um ein Zentrum liegt ein Ring aus 8 Zellen, auf denen **Köpfe** (Item 33 „Giant stone head“) stehen oder fehlen. Jede Ringzelle gehört zu genau einem **echten Hebel**, der den Kopf dort setzt oder entfernt. Die Hebel stehen weit verteilt im Dungeon, nicht in Sichtweite des Rings. Daneben stehen **Dummy-Hebel**, die genau gleich aussehen und sich genau gleich bedienen lassen, aber nichts bewirken. Der Spieler muss also nach jedem Zug zurück zum Ring, nachsehen, wie das Muster jetzt aussieht, und gegebenenfalls zurückschalten. Passt das Muster, schaltet der **Prüfer** im Zentrum den Teleporter frei.

Hinweis im Spiel (Sarg bei 4975/5026): *„Only if the corners groan, the center will reveal my master.“* → Muster „Köpfe in den vier Ecken“.

**Der Ring (Zentrum 4987/5015, Köpfe = Item 33):**

```
            x=4986   x=4987    x=4988
y=5014        NW        N        NE
y=5015         W     [Zentrum]    E
y=5016        SW        S        SE
```

| Zustand | Köpfe auf |
|---|---|
| Start (Karte) | NW, NE, W, S |
| Ziel (Prüfer) | **NW, NE, SW, SE** (die vier Ecken) |
| Nötige Änderung | SW setzen, SE setzen (2 Hebelzüge) |

Der Prüfer (Aktion 46) listet nur die vier Ecken (`location_1..4`, je `item_id 33`). **Die Kanten prüft er nicht**, weder im Altcode (`action_handler.py`, Fall 46) noch im Neubau (`campaign/engine.ts`, `teleportOnItems`): W und S dürfen stehen bleiben. „Nur Köpfe in den Ecken“ wäre die strengere Lesart des Rätsels (4 Züge), die der Prüfer so nicht erzwingt.

**Die 8 echten Hebel** (Aktion 45, zwei Zustände, jeder mit eigener Hebelstellung `rotation` und Zielaktion):

| Hebel steht bei | steuert Ringzelle | Zustand 1 | Zustand 2 |
|---|---|---|---|
| 4987/5023 | NW | Kopf setzen | Kopf entfernen |
| 4993/5020 | N | entfernen | setzen |
| 4998/5014 | NE | setzen | entfernen |
| 4992/5003 | W | setzen | entfernen |
| 4985/5003 | E | entfernen | setzen |
| 4981/5010 | SW | entfernen | setzen |
| 4989/5003 | S | setzen | entfernen |
| 4978/5025 | SE | entfernen | setzen |

Bei 4 Hebeln bedeutet Zustand 1 „setzen“, bei 4 „entfernen“. Die Hebelstellung verrät also nicht, was der Hebel gerade bewirkt. Das ist Absicht des Rätsels: nur der Blick auf den Ring zeigt es.

**Die 8 Dummy-Hebel** (gleiche Aktion 45, beide Zustände mit Zielaktion `0/0`, also ohne Wirkung): 4975/5002, 4997/5002, 4994/5011, 4998/5015, 4989/5023, 4978/5024, 4988/5024, 4984/5030. Verhältnis echt zu Dummy in der Kampagne: **8 zu 8**.

**Wie ein Hebel den Kopf setzt (Implementierung der Kampagne):** Jede Zustandsaktion zeigt auf eine Hilfszelle weit außerhalb der Spielfläche (y 4993 bis 4998) mit einer **Copy/Move-Aktion** (9039, `copy`). Sie kopiert eine **Vorlagezelle** auf die Ringzelle. Eine Vorlage mit Kopf setzt einen Kopf (Vorlagenring bei 4986 bis 4988 / 4996 bis 4998), die leere Vorlage 4983/4997 entfernt ihn. Für den Generator genügt es, das Item der Ringzelle direkt zu setzen oder zu löschen.

**Wirkung:** Betreten des Zentrums löst die Prüfung aus (Aktion 46 liegt auf 4987/5015). Bei Erfolg: Sound 9041 und Teleport nach 4962/5021, in den Raum mit der **Schwarzen KeyCard** (4962/5020) und einem Portal zurück zum Eingang (4961/5020).

**Variationsraum für den Generator** (alle Punkte außer der Original-Spalte sind **[Entwurf]**):

| Parameter | Original | Mögliche Varianten |
|---|---|---|
| Zielmuster | vier Ecken | vier Kanten, eine Diagonale, eine Reihe, nur ein 2 × 2-Block, beliebige 1 bis 4 Zellen |
| Prüfregel | nur „Kopf vorhanden“ auf bis zu 4 Zellen | zusätzlich „Zelle muss leer sein“ (braucht eine kleine Erweiterung der Prüfaktion); mehrere Prüfer für mehr als 4 Zellen |
| Ringform | 3 × 3 um ein Zentrum | Kreuz, Reihe, 2 × 2, freie Zellmenge |
| Dummy-Hebel | 8 echt, 8 Dummy | 0, 1 bis 100 Prozent, mehr Dummys als echte |
| Hebel je Zelle | 1 | 2 (beide schalten dieselbe Zelle) |
| Hebelverhalten | Toggle, Hälfte setzt in Zustand 1, Hälfte entfernt | immer „setzen“ mit einem Reset-Hebel |
| Startmuster | NW, NE, W, S | zufällig, mindestens 2 Züge vom Ziel entfernt |
| Wirkung | Teleport zur KeyCard | Gitter öffnen (Aktion 16/18), Truhe freigeben, Gegner spawnen (9034), Falle abschalten, Item erscheinen lassen (9039) |
| Dekoration der „Köpfe“ | Steinköpfe (Item 33) | jedes zum Bewohner passende Prop aus Abschnitt 3 (Magische Flammen 121 im Magier-Dungeon, Fässer im Goblinbau, Statuen 27/28 bei Menschen) |
| Hinweistext | rätselhafte Zeile | Zeile mit Zahl oder Skizze, auch als Schriftrolle/Lesepult 119 |

**Pflichtprüfungen für den Generator:**

1. **Lösbar:** Jede Zelle, in der Start- und Zielmuster abweichen, hat einen echten Hebel; mindestens ein Hebel ist weit genug vom Ring entfernt, dass man nicht gleichzeitig Hebel und Ring sieht [Entwurf: Mindestabstand].
2. **Hebel erreichbar, ohne die Wirkung vorauszusetzen:** Kein Hebel liegt hinter dem Gitter, dem Teleport oder der Tür, die das Rätsel erst öffnet.
3. **Ring einsehbar:** Der Ring ist von einer begehbaren Zelle aus zu sehen, das Zentrum erreichbar.
4. **Dummy-Hebel sind echte Hebel-Items** (Item 39) mit denselben Texten und Stellungen; nur die Zielaktion ist leer.
5. **Hinweistext passt zum Zielmuster** und steht lesbar vor oder am Ring.
6. **Höchstens 4 Prüfzellen je Prüfer** (Handler liest `location_1..4`).

#### 2a.2 Rotationsrätsel (Cathedral of Carnage)

**Mechanik [Karte]:** Fünf drehbare Statuenköpfe (Item 29, Aktion 45 mit vier Zuständen 0/90/180/270) stehen in einer Reihe bei y 5004 (x 4972, 4974, 4976, 4978, 4980). Jede Drehung ruft den Prüfer (Aktion 9047, Rotation-Check) bei 4990/4996 auf. Der Prüfer verlangt: Kopf bei 4980 = 180°, 4978 = 90°, 4976 = 0°, 4974 = 270°, 4972 = 180°. **Erfolg** öffnet 4991/4995, **Fehler** löst 4989/4995 aus.
**Hinweise im Spiel:** „From the south the glorious Moose King watches the key.“, „Drink from the cup, unlock the key, answer the question and I hear your plea.“
**Lösung (Hinweis des Nutzers, an den Daten geprüft):** Die fünf **Kelche** bei 4990 bis 4994 / 5018 sind der Hinweis. Wer trinkt, bekommt eine negative Kondition (Versteinert bei 4990 und 4991, Tot bei 4992 und 4993, Verrottet bei 4994) und „sieht“ einen Buchstaben, eine Himmelsrichtung: von links nach rechts **N, W, S, S, N**. Die Köpfe von links (4972) nach rechts (4980) brauchen die Drehungen 180, 270, 0, 90, 180. Liest man 180 als Norden, 270 als Westen, 0 als Süden und 90 als Osten (die Köpfe schauen entgegen ihrer Rotationsangabe), ergibt sich **N, W, S, E, N**. Vier von fünf Stellen stimmen mit den Kelchen überein. **Der vierte Kelch (4993/5018) zeigt S statt E: das ist laut Nutzer ein Fehler in den Altdaten.** Die richtige Folge ist **N, W, S, E, N**; der Generator übernimmt den Fehler nicht.
Dasselbe Prinzip trägt den Rest der Kathedrale: die leuchtenden Altäre ergeben, von rechts gelesen, **MOOSE** (E S O O M) und **RAGE** (R A _ G E), und die Statue fragt, was der Moose King fühlt, wenn man seine Orbs nimmt (Antwort `rage`). Die Buchstaben liegen auf Vorlage-Altären in einem Steuerbereich außerhalb der Karte (Zellen ohne Block oberhalb des Gebäudes) und werden per Copy-Aktion (9039) auf die „leblosen“ Altäre der Halle kopiert (Reihe y 5002: fünf Altäre, Reihe y 5010: vier Altäre mit Lücke bei 4993). Welcher Auslöser das kopiert, habe ich nicht geprüft.
**Für den Generator:** Das Gerüst ist klar (n Köpfe, je 4 Drehungen, ein Prüfer, Erfolgs- und Fehleraktion). Der Hinweis ist eine **Kette aus „tu etwas Unangenehmes, lies die Richtung ab“**: n Kelche (oder andere Hinweisgeber) mit je einer Strafe (negative Kondition) und einer Himmelsrichtung, in der Reihenfolge der Köpfe angeordnet.

#### 2a.3 Einmal-Hebel (Wildabar Cavern)

**Mechanik [Karte]:** Vier Hebel (Aktion 31, nur einmal benutzbar). Jeder löst zwei Folgeaktionen aus: einen **Tür-Öffner** (Aktion 9032, öffnet 4 bis 6 Gittertore) und einen **Fallen-Leger** (Aktion 9033, `trap_type 1`, Schaden 50, ein bis zwei Fallenzellen). Ein Zug öffnet also Wege und armiert gleichzeitig Fallen auf oder neben ihnen. Der Reiz liegt in der Reihenfolge: welcher Hebel zuerst, damit die Fallen nicht den eigenen Weg treffen. Welche Reihenfolge die Karte vorsieht, habe ich nicht ausgewertet.

#### 2a.4 Was ich von den Rätseln der Originallevel entschlüsselt habe

| Rätsel | Mechanik | Lösung/Hinweis |
|---|---|---|
| Arachnoid Cavern (Gongs, Lords) | vollständig | Antwort 39 nachgerechnet (Abschnitt 4.1) |
| Fortress of Fear (Kopf-Ring) | vollständig (Daten + Altcode) | Lösung „SW und SE setzen“ aus den Daten abgeleitet, **nicht im Spiel getestet** |
| Cathedral of Carnage, Köpfe drehen | Mechanik vollständig | Hinweis in den Kelchen: N W S E N (der vierte Kelch zeigt in den Altdaten fälschlich S, vom Nutzer bestätigt), siehe 2a.2 |
| Cathedral of Carnage, Altäre | Buchstaben der Altäre | MOOSE und RAGE (Antwort `rage`); die Antwort `jvciii` ist ein **Easteregg** (Nutzer) und für den Generator irrelevant |
| Dark Warriors Keep | Formel: Geheimzahl + (Fire Helmet 16 + Desert Wind 200 + Shadow Grave 2) − (Ice Wings 7 + Green Forest 8 + Phantom Sorrow 73) | Antwort 159 ergibt Geheimzahl **29**; sie steht im Kartenbild, siehe 2a.6 |
| Whiteshield Dungeon | neun Zettel „The Nth one is X“ | **CHAINMAIL** (C H A I N M A I L, Zettel 1 bis 9) |
| Wildabar Cavern | Einmal-Hebel, Tore und Fallen | Reihenfolge **nicht ausgewertet** |
| Cursed Cold Cavern, Halls of Insanity, Slithercult, Fountain Head Cavern | Rätselstatuen mit `riddle_id` | Antworten stehen in `RIDDLES_MASTER.json`; was sie genau öffnen, nur stichprobenartig geprüft |
| Maze from Hell, Slithercult Stronghold | Sprungfeld mit unsichtbaren Teleportern (und Beilen) | vollständig (Daten + Hinweis des Nutzers), siehe 2a.5 |
| Tomb of Terror | **kein Quest** (Hinweis des Nutzers). Goldraub-Fallen vor 5 Türen, Sarg mit Boss optional, Thron-Sonderaktion 53 nur mit Titel Perfect Adventurer | vollständig |
| Dragon Cavern | **kein Quest** (Nutzer): nur sehr starke Gegner, Warn-Schädel, Schatzhaufen | vollständig |

Fazit zu Ihrer Frage: Ja, ich kann Rätsel nur interpretieren, soweit sie aus Aktionsparametern bestehen oder alle Hinweise als Text in der Karte stehen. Die Fortress of Fear hatte ich in der ersten Fassung falsch zusammengefasst (Mumien erscheinen lassen); jetzt ist sie aus den Daten belegt. Die als „offen“ markierten Rätsel sollten Sie entweder im Spiel prüfen oder mir die Lösung nennen.

#### 2a.5 Sprungfeld (Maze from Hell, Slithercult Stronghold)

**Idee:** Ein Bereich des Dungeons ist mit **Teleportern** ausgelegt, die entweder unsichtbar sind (Slithercult) oder als Runen auf dem Boden liegen (Maze from Hell, dort sichtbar); im Slithercult kommen sichtbare Beile dazu. Wer auf einen Teleporter tritt, landet an einem festen Punkt zurück am Anfang des Bereichs. Es gibt einen Weg, der keinen Teleporter und keine Falle berührt. Der Spieler muss sich merken, wo die Teleporter und Fallen liegen, und kommt durch, indem er sie mit den Zaubern **Sprung** (Jump, Zauber 16, Stufe 4, 4 Mana, „Moves the party two spaces ahead“) oder **Teleport** (Zauber 47, Stufe 11, 10 Mana, „Moves party up to nine spaces“) überspringt. Beide Zauber liegen in freien Dungeons: Sprung in der Cyclops Cavern (Knochenhaufen), Teleport in der Magic Cavern.

**Belegt [Karte]:**

| | Maze from Hell | Slithercult Stronghold |
|---|---|---|
| Teleporter (Aktion 27) | 15 | 12 |
| Träger | Item 73 „Magic runes“ (flaches Bodenmodell, kein Hindernis): **sichtbar** (Bestätigung des Nutzers) | **kein Item**, also unsichtbar |
| Ziel aller Teleporter | 4993/5002 (Start, Blick nach Osten) | 4985/5005 (Blick nach Westen), im Beilraum |
| Bereich | verteilt über das ganze Labyrinth (4971 bis 4993 / 5008 bis 5028) | ein Raum bei 4977 bis 4983 / 5002 bis 5006; Teleporter an 4977/5002, 4979/5003, 4981/5003, 4977/5004, 4978/5004, 4980/5004, 4978/5005, 4980/5005, 4977/5006, 4980/5006, 4982/5006, 4983/5006 |
| Fallen im Bereich | keine | 12 Beil-Items (87) in demselben Raum; **im Raum hat keines eine Fallenaktion**, die 7 Beil-Aktionen (Aktion 24) liegen weiter südlich (y 5022 bis 5031). Ob die Beile im Raum im Original treffen, geben die Daten nicht her; Sie beschreiben den Raum als Fallenraum, also gehe ich von ja aus |

**Variationsraum für den Generator [Entwurf]:**

| Parameter | Original | Varianten |
|---|---|---|
| Teleporterzahl und Dichte | 12 bis 15 | beliebig, aber Pfad bleibt lösbar |
| Sichtbarkeit | unsichtbar (Slithercult), Runen auf dem Boden (Maze) | unsichtbar, Runen, leichte Bodenverfärbung; sichtbar = Geschicklichkeitsrätsel, unsichtbar = Merkrätsel |
| Zielpunkt | immer derselbe Punkt am Anfang | pro Teleporter verschieden, auch zufällig in einen anderen Raum |
| Gefahr statt Teleport | Beile (Slithercult) | Gruben, Speere, Goldraub; passend zum Thema aus Abschnitt 1.1 |
| Sprungweite | Sprung (1 Zelle überspringen) reicht | Teleport nötig (mehrere Gefahrenzellen hintereinander) |

**Pflichtprüfungen für den Generator:**

1. **Lösbar:** Es gibt einen Weg vom Eingang zum Ausgang des Bereichs, auf dem nirgends zwei Gefahrenzellen hintereinander liegen, wenn nur Sprung verlangt wird. Bei mehreren hintereinander muss Teleport verlangt werden.
2. **Zauber erreichbar:** Der benötigte Zauber (Sprung, Teleport) ist vor dem Bereich in einem Dungeon erhältlich, das der Spieler ohne diesen Bereich erreicht (Klasse A). Zauber lernt nur die Schule der Klasse ab der Stufe des Zaubers (`CLAUDE.md`, `learnBlock`).
3. **Es gibt einen Hinweis** oder der Spieler kann sich die Stellen merken: nach einem Treffer bleibt die Teleporterposition erkennbar (Position des Rückstoßes), sonst wäre das Feld reines Raten.
4. **Der Rückführpunkt liegt vor dem Bereich**, nicht dahinter und nicht im Gefahrenbereich selbst (Original Slithercult setzt ihn mitten in den Raum auf Zelle 4985/5005, der selbst ein Beil-Item trägt; nicht übernehmen) [Entwurf].

#### 2a.6 Kartenbild-Rätsel (Dark Warriors Keep, Cathedral of Carnage)

**Idee (Nutzer bestätigt: als Typ verwendbar, Zahlen oder Buchstaben):** Der **Grundriss** eines Raums, also die Anordnung von Wänden und Boden, bildet eine oder mehrere Ziffern oder Buchstaben. Der Spieler sieht sie, wenn er die Karte öffnet, und trägt das Ergebnis als Antwort in ein Rätsel (Aktion 42) oder als Rechenwert in eine Formel ein.

**Belegt [Karte]:**

| | Dark Warriors Keep |
|---|---|
| Rätsel | Zahlenformel (Abschnitt 4.2), die Geheimzahl ist **29** |
| Bild | Im großen Südraum (ca. 4979 bis 4987 / 5024 bis 5032) stehen im Inneren Wandstücke, die zwei nebeneinanderliegende Zeichen bilden. In meiner Textdarstellung des Grundrisses sind sie nur ungefähr als Ziffern zu erkennen; der Nutzer liest „29“. |
| Art der Zeichen | Ziffern |

Die zweite Fundstelle, die Statue der Kathedrale mit *„Look on the map …“* und der Antwort `jvciii`, ist laut Nutzer ein **Easteregg** und zählt nicht als Beispiel. Das Original belegt den Typ also nur einmal; Buchstaben sind eine Erweiterung, die der Nutzer ausdrücklich freigegeben hat.

**Variationsraum für den Generator [Entwurf]:**

| Parameter | Varianten |
|---|---|
| Zeichenart | Ziffern (0 bis 9), Buchstaben (nur gut lesbare), kurze Wörter |
| Anzahl | 1 bis 6 Zeichen; Original 2 Ziffern bzw. 6 Buchstaben |
| Zeichenbild | Pixelschrift 3 × 5 Zellen, Strich 1 Zelle breit, 1 Zelle Abstand; als Wandstücke im Raum (Original) oder als Boden-/Wandmuster eines Ganges |
| Verwendung | Antwort einer Rätselstatue (Aktion 42), Eingabewert einer Rechenformel (Dark Warriors), Teil eines Codes für einen Teleporter |
| Hinweis | Text im Dungeon („Look on the map“), oder die Formel nennt eine „Geheimzahl“ ohne Fundort |

**Pflichtprüfungen für den Generator:**

1. **Lesbar auf der Karte:** Jedes Zeichen ist aus einer festen Bitmap (Pixelfont) gebaut. Ein Test rendert den Grundriss und vergleicht die Zeichenfläche mit der Bitmap, sonst hängt das Rätsel an einem Zufallsgrundriss.
2. **Raum groß genug:** Zeichen plus Rand passen in den Raum (3 × 5 je Zeichen plus 1 Zelle Abstand), und der Raum ist begehbar, damit die Karte ihn zeigt.
3. **Antwort stimmt:** Die vom Generator in die Rätselaktion geschriebene Antwort ist exakt das gebaute Zeichen.
4. **Spieler kann die Karte lesen:** Die Spielerkarte zeigt Wände und Boden der Zellen (sichtbarkeitsabhängig, siehe `HANDOVER.md`); das Zeichenbild darf nicht erst nach dem Lösen sichtbar werden.

---

## 3. Stilregeln: wer wohnt hier, was darf stehen

Prinzip: **Was die Bewohner nicht benutzen können, steht nicht im Level.** Spinnen lesen keine Bücher, also gibt es bei Spinnen keine Regale. Das Aufräumen folgt dem Bewohner: Menschen ordentlich und funktionstüchtig, Goblins und Orks unaufgeräumt und kaputt, Tiere und Insekten rein natürlich.

Bewohnerklassen (Spalte „Gruppe“ nach `src/data/monsterThemes.json`, Anhang A):

| Klasse | Typische Bewohner (Gruppe) | Erlaubte Props (Item-ID) | Verbotene Props |
|---|---|---|---|
| **Insekten, Spinnen, Gifttiere, Tiere** | `beast` (Giant Spider, Dino Beetle, Toxic worm, Wild Fungus, Screamer, Moose Rat, Vampire Bat) | Knochenhaufen 70 (Opfer), Kristalle 117, Magische Runen 73, Magische Becken 88/37 (nur als Magiequelle). Nur wenn das Theme eine **Herrscher-Quest** hat (wie die Arachnoid Cavern): Lords 52 mit je einem Thron 30, Gongs 118, Lesepult 119. Fässer 5 nur, wenn Goblins mitwohnen (Fountain Head Cavern). | Alles, was Menschen benutzen: Tische 94/14, Regale 75/97, Alchemietisch 15, Banner 104/105, Truhen im Wappenstil, Kamin 71 |
| **Goblinoide, Orks, Oger, Zyklopen, Zwerge (wild)** | `humanoid`, niedrige Tiers (Goblin, Orc Warrior, Ogre, Cyclops, Mad Dwarf) | Knochenhaufen 70 (Beute), Fässer 5, Rustikale Laternen 76, Rustikaler Tisch 94, Mining tools 12, Abandoned fireplace 71, Eisentruhen 74, Holztruhen 1, Eisentore 81, Gebissene/zerbrochene Dinge (Fractured vessels 83). Alles **unaufgeräumt**: Knochen neben Tischen, umgekippte Gefäße. | Ritualkreis, Bücherregale, Altäre, Banner geordneter Reiche |
| **Menschen (Ritter, Krieger, Wachen)** | `humanoid`, höhere Tiers (Jouster, Evil Ranger, Black Knight, Castle Guard) | Ordentliche Tische 94 und Speisetische 14, Statuen 28/27/61, Banner 104/105/Good, Throne 6/30, Eisentruhen 74, Eisentore 81 (funktionstüchtig). | Knochenhaufen als Dekor (außer als Kampfspur), Hängende Skelette |
| **Magier, Hexen, Kultisten** | `humanoid` (Wicked Witch, Sorcerer, Cleric/Priest of Moo, Cult Leader) + `cold` | **Ritualkreis**: Magische Runen 73, Altäre 35, Magische Becken 88/37, Bücherregale 75 (alt: 97), Alchemietisch 15, Zerbrochene Gefäße 83, Magische Flammen 121, Kelche 86, Lesepult 119. | Fässer, Eisentore im Stil von Kasernen |
| **Untote** | `undead` (Skeleton, Zombie, Ghoul, Mummy, Ghost, Reaper, Lich, Vampire) | Särge 62 und Steinsärge 127/128, Knochenhaufen 70, Galgen 98, Hängende Skelette 93, Grabsteine, Statuenköpfe 29, Throne 6 (böse), Banner 105 (böse). | Fässer, Speisetische, Tierfutter |
| **Feuer/Dämonen** | `fire` (Candle Creep, Fire Stalker, Mini Dragon, Major Devil/Demon) | Lavapfützen 120, Magische Flammen 121, Obsidian-Statuen, Dämonenaltäre 35. | Eis, Wasser, Bücherregale |
| **Drachen** | `fire`/`cold`/`beast` (Dragon Lord, Green Dragon, Draconi) | Säurepfützen 92, Schatzhaufen 4, Schädel auf Pfählen 38 (Warnung), Orbs 109. | Möbel, Banner |
| **Konstrukte, Wächter, Cyber** | `construct`, `cyber` | Cyber-Wände (Item 84/85), Kraftquellenkristalle 67, Transporter 40, Riesige Steinköpfe 33. Im Spaceship nie organische Props. | Knochen, Särge |

Drei Querregeln:

1. **Skelette** (Knochenhaufen 70, Hängende Skelette 93, Gerippe) sind für Spinnen- und Insektenhöhlen **Opfer** (abgenagt, nur Knochen), bei Goblin/Ork/Monster-Dungeons **Kriegsbeute**, bei Menschen **nicht** gewünscht, bei Untoten **Bewohner**.
2. **Throne** gehören dem Herrscher des Levels: in der Arachnoid Cavern steht neben **jedem** der Lords ein Thron (Karte: Lord = Item 52, Thron = Item 30 „Throne (Good)“ mit Rotation `ir` 45, 8 von 10 Lords haben ihn direkt daneben). Wer keinen Herrscher hat (Spinnen, Käfer), bekommt keinen Thron.
3. **Truhenfallen** folgen der Schadensart des Themes (Maze from Hell: versteinernd/tödlich/verrottend; Halls of Insanity: Fluch; Tomb of Terror: Fluch/Säure).

---

## 4. Katalog der Dungeon-Themes

Gliederung: A = frei, B = Schlüssel-Dungeon (Abschnitt 1.2). Alle Angaben [Karte], außer wo markiert. „Tier“ ist `treasure_level` aus `MONSTER_DATA.json`. Alle Dungeon-IDs verweisen auf Anhang A (Monster) und B (Props).

### 4.1 Klasse A: frei betretbar

#### Arachnoid Cavern (Spinnenhöhle) – Referenztheme

| | |
|---|---|
| Karte | 55 × 44, 37 Monsterzellen, 126 Aktionen |
| Monster | Giant Spider (30, Tier 1, vergiftet) · Dino Beetle (18, Tier 2) · Toxic worm (70, Tier 4, vergiftet) – alle `beast`, Insekten/giftig |
| Falle | **keine** |
| Stil | Magische **Kristalle** 117 (4 Attributskristalle: Genauigkeit, Intellekt, Glück, Persönlichkeit je +5, dazu 13 weitere), **Knochenhaufen** 70 (26, abgenagte Spinnenopfer, geben Zauber), 10 **Lords** (Persona 52), je ein **Thron** 30 daneben, 8 **Gongs** 118, Magische Runen 73, Hebel 39, Lesepult 119. **Kein** Tisch, Regal, Fass, Banner. |
| Hauptquest | **Gongs und Lord Intelligence**, siehe unten |
| Schlüsselrolle | **Klasse A**: Blauer Schlüssel (schwebt in der Luft, 4990/5011) und Oranger Schlüssel (4996/5031, als `quest_key_bronze` vergeben, siehe 1.2) |
| Belohnung | Zauber aus Knochenhaufen (spell_35, 55, 56, 67, 45, 51, 49), Attribute aus Kristallen, Aufladen der Kristalle für 1.000.000 Gold, Talente bei Lord Prayer (`talent_prayer_master`) und Lord Magic (`talent_prestidigitator`), Mönchsquest (Bruder Epsilon, Quatloo-Münze) |

**Quest im Detail [Karte]**

1. Das Lesepult sagt: *„Only when all four gongs sound will the master reveal himself. But beware, for the vermin are just waiting for the gong's tolling.“*
2. In den **vier Ecken** steht je ein Gong (Aktion 40, `counter_id: gong_arachnoid`, `target_value: 4`). Jeder Gong lässt **einmal** Spinnen erscheinen (Spawn-Aktionen 9034 mit Monster 30 und 18, Blickrichtungen 0/180/270). Erneutes Schlagen bringt nur „You sound the gong again.“
3. Beim vierten Gong wird die Zielaktion bei 4955/4992 frei: **Lord Intelligence** erscheint (Rätsel-Trigger 42, Antwort `39`, danach Kauf-Trigger 43).
4. Die Antwort ergibt sich aus den anderen Lords. Start bei **Lord Personality: 10**:

| Lord | Hinweis (Karte) | Wert |
|---|---|---|
| Personality | „Start with 10.“ | 10 |
| Endurance | Zahl der Throne × 5, addieren (10 Throne) | +50 |
| Luck | Zahl der Gongs × 2, subtrahieren (4 Gongs) | −8 |
| Speed | 49 abziehen | −49 |
| Strength | Zahl der Kristalle im Raum × 3, addieren (4 Kristalle) | +12 |
| Accuracy | die Zahl von Lord Strength verdoppeln, addieren | +24 |
| **Summe** | | **39** |

   Geprüft: 10 + 50 − 8 − 49 + 12 + 24 = 39. Die „4 Kristalle im Raum“ sind rechnerisch bestimmt (nur dann ergibt sich 39), die Raumgrenze selbst habe ich auf der Karte nicht nachgezählt.
5. Lord Intelligence lädt gegen **1.000.000 Gold** alle Kristalle wieder auf.

**Abweichung Original [Guide]:** Dort beginnt man bei Lord Might (Macht) und geht die Lords in alphabetischer Reihenfolge ab, das Ergebnis ist **20301**, die Belohnung **1.000.000 Erfahrungspunkte**; Lord Macht lädt die Kristalle für 5000 Edelsteine auf. Die Gongs rufen auch dort zusätzliche Monster in einer anderen Ecke herbei.

**Für den Generator:** Gongs (4, je einmal Spawn), Lords mit Thron, Zahlenrätsel mit Rechenvorschrift je Lord. Die Zahlen müssen aus dem Level selbst zählbar sein (Throne, Gongs, Kristalle).

---

#### Cursed Cold Cavern (Hexenhöhle)

| | |
|---|---|
| Monster | Carnage Hand (7, Tier 2, resistent gegen Magie, `undead`) · Wicked Witch (77, Tier 3, Fernkampf, verflucht Ausrüstung) · Black Knight (3, Tier 4, Boss, hasst Paladine) |
| Falle | **Beil** (Guillotine, 20 Stück, Schaden 30) |
| Stil | Magische Becken 88/37 (Hexenkessel, gelb 7, rot 4), Eisentruhen 74 (8, mit Wappen und Hexensymbolen), Magische Runen 73, Statuen Pegasus 28, böse Banner 105, zerbrochene Gefäße 83. Hexen = Ritualstil. |
| Hauptquest | **vier Rätselstatuen** (`riddle_id` 23 bis 26: Antworten *obvious*, *w*, *man*, *piano*) mit Hinweistexten („The code to lift the sunken island is *youth*“, Piratenschatz, Pearl of Youth) |
| Schlüsselrolle | **Klasse A**: Schwarzer Schlüssel, der in den Runen schwebt (4997/5006) |
| Belohnung | Eisentruhen mit Artefakten (gut/böse/neutral, Quest-Items), Truhen des Black Knight mit 120.000 und 200.000 Gold (Tier 4), Becken geben Magieresistenz +20, Stufenaufstieg oder Pearl of Youth (mit 50 Magieschaden) |

#### Cyclops Cavern (Zyklopenhöhle)

| | |
|---|---|
| Monster | Wild Fungus (78, Tier 1, trifft alle) · Bugaboo (5, Tier 2) · Cyclops (13, Tier 5, macht verrückt) · Cyclops King (82, Tier 5, Boss) |
| Falle | **Speer** (Spring, 12 Stück, Schaden 25) |
| Stil | **Knochenhaufen** 70 (28, „bite marks“, „dry bones“, zerfressen von Ratten und Zyklopen), Magische Becken rot 14, Eisentruhen 74 (13, mit einem Auge graviert), Eisentore 81 (10, Gittertore, Monster-Hindernisse 26). Wilde Bewohner: kein Möbel. |
| Hauptquest | keine Rätselquest; Schlüssel finden und Kampf gegen den Zyklopenkönig |
| Schlüsselrolle | **Klasse A**: Grüner Schlüssel (4975/5009) und Roter Schlüssel (4984/5015) |
| Belohnung | Zauber aus Knochenhaufen (spell_15, 16, 33, 36, 37, 42, 43, 44, 53), Silberne Schädel (Quest-Item), 500.000 Gold in einer Truhe, Magieresistenz +20, Stufenaufstiege aus den roten Becken (mit Magieschaden bis 500) |

[Guide]: Der Zyklopenhöhle-Schlüssel ist der grüne „Augapfelschlüssel“ für die Halls of Insanity; der rote Kriegerschlüssel für das Kriegerheim (Dark Warriors Keep) liegt ebenfalls hier.

#### Magic Cavern (Magische Höhle)

| | |
|---|---|
| Monster | Guardian (34, Tier 4, `construct`) · Sorcerer (66, Tier 4, Eis, Fernkampf) · Lich (38, Tier 5, tödlich) |
| Falle | **keine** |
| Stil | Magische Flammen 121 (17), Amethyst-Altäre 35 (14, „Magic Runes are carved into the altar“), Bücherregale 75, Magische Becken gelb 5 (Intellekt +10) und rot 5 (Tempo +10), verschlossene Steinsärge 127 (7, Liche), Eisentore 81. Ritualkreis-Stil. |
| Hauptquest | Die Höhle kostenlos plündern: Zauber hinter dünnen Wänden (Breakable wall 8), Liche in Särgen (Spawn 9034, Monster 38) |
| Schlüsselrolle | **Klasse A**: **Goldener Schlüssel** in einem Steinsarg bei 4973/5029 (zusammen mit 500.000 Gold). Öffnet Maze from Hell. |
| Belohnung | Zauber aus den Altären (spell_41, 42, 44, 47, 50, 52, 58, 59, 62, 63, 68, 74, 76, 77), Attributbecken |

[Guide]: „Besonders nervig sind die Dämpfe, die aktive Sprüche (Licht, Schutz vor Elementen) unwirksam machen.“ In der Karte steht dafür `Remove Event` (Aktion 49, 17 Zellen). Der goldene Meisterschlüssel liegt in einem der Särge.

---

#### Dragon Cavern (Drachenhöhle)

| | |
|---|---|
| Monster | Draconi (20, Tier 3) · Green Dragon (33, Tier 5, Fernkampf, Kälte) · Dragon Lord (83, Tier 5, Boss, Feuer) |
| Falle | **keine** Fallenaktion; 28 Säurepfützen 92 sind „Fischen“-Schätze mit Säureschaden (Truhenfallen-Typ) |
| Stil | Säurepfützen 92 (28), **Schatzhaufen** 4 (11, Beute des Drachen), Schädel auf Pfählen 38 (5, Warnschilder in Reimen: „Turn around before it's late …“), Orbs of ultimate power 109 (4). Keine Möbel, keine Banner. |
| Hauptquest | **keine** (Nutzer: „kein Quest, nur sehr starke Gegner“). Der Reiz ist die Warnstrecke mit Green Dragons (Tier 5, je 500.000 XP) bis zum Dragon Lord; unterwegs Orbs (Quest-Item `quest_orb`) und Schatzhaufen |
| Schlüsselrolle | Klasse A, **ohne** Schlüssel (der Guide: „kommst Du ohne weiteres hinein, solltest aber vorher Erfahrung sammeln“) |
| Belohnung | Schatzhaufen bis 5.000.000 Gold (Tier 5, 10 Gegenstände), 250.000 Gold (Tier 5), Orbs |

#### Temple of Moo (Tempel des Moo)

| | |
|---|---|
| Monster | Skeleton (64, Tier 1) · Zombie (80, Tier 1, Krankheit) · Cleric of Moo (9, Tier 3, Boss) |
| Falle | **Grube** (Pit, 19 Stück, Schaden 20) |
| Stil | Knochenhaufen 70 (18), Holztruhen 1 (10), Löwenstatue 27, Magische Runen. Untote + Priester: Gräber und Knochen, keine Möbel. |
| Hauptquest | Durch die Gruben zum Cleric of Moo; Talent kaufen |
| Schlüsselrolle | Klasse A, ohne Schlüssel |
| Belohnung | Talent **Kreuzritter** (`title_crusader`), das den Zugang zu den Burgen (Whiteshield, Bloodreign) freischaltet; Silberne Schädel (Quest-Item) |

#### Slithercult Stronghold (Schlitzerkultfestung)

| | |
|---|---|
| Monster | Candle Creep (6, Tier 1, Feuer, Fernkampf) · Cobra Fiend (10, Tier 2, schläfert ein) · Evil Ranger (24, Tier 2) · Cult Leader (81, Tier 3, Boss, jagt Druiden) |
| Falle | **Beil** (21 Stück, Schaden 10) |
| Stil | Statuenköpfe 29 (8), Magische Becken gelb 10, Eisentruhen 74 (10), Teleporter (12), Persona Seth Squirm. Kultstil: Becken/Statuen, nicht Möbel. |
| Hauptquest | **Sprungfeld** (2a.5): Raum bei 4977 bis 4983 / 5002 bis 5006 mit 12 unsichtbaren Teleportern und Beilen; Rätselstatue (`riddle_id` 1: *gold coin*), Quatloo-Münzen gegen Attribute tauschen (Aktion 29), Kultführer hinter einer dünnen Wand [Guide] |
| Schlüsselrolle | Klasse A, ohne Schlüssel |
| Belohnung | Artefakt des Neutralen, Pearl of Youth, Silberne Schädel, Attribut +5 gegen Quatloo, Stufenaufstieg und Säureresistenz aus den Becken |

#### Cave 01, 02, 03

Kleinste Höhlen (8 × 8 bis 8 × 9): ein Holzschatz und optional zwei Orc Warriors (Cave 03). Klasse A, keine Falle, kein Schlüssel. Taugt als Mini-Theme „Versteck“ [Entwurf: Kleinstdungeon ohne Quest].

---

### 4.2 Klasse B: Schlüssel nötig

#### Cathedral of Carnage (Blutbadkathedrale)

| | |
|---|---|
| Monster | Gargoyle (27, Tier 3, lähmt) · Cleric of Moo (9, Tier 3) · Priest of Moo (59, Tier 5) · Moo Master (86, Tier 4, Boss) |
| Falle | **keine** (Kelche sind versteinernde/tödliche Truhenfallen) |
| Stil | Moose-King-Dekor 125 (38), **Amethyst-Altäre** 35 (31, „Dark flames“, lehren Zauber), Statuenköpfe 29 (10, drehbar), **Kelche** 86 (7), Hebel 39 (6), Orbs 109 (3). Kultstil, Priester. |
| Hauptquest | **Rotationsrätsel** (2a.2): fünf Statuenköpfe auf Himmelsrichtungen drehen. Die Richtungen zeigen die fünf **Kelche** (Trinken = negative Kondition, danach „N“, „W“, „S“, „E“, „N“; die Altdaten zeigen am vierten Kelch fälschlich „S“). Dazu die Altäre (MOOSE, RAGE) und die Statue *„If you take his orbs of ultimate power, what will the Moose King feel?“* (Antwort `rage`). Eine zweite Rätselstatue mit der Antwort `jvciii` ist ein Easteregg und gehört nicht zum Theme. |
| Schlüsselrolle | **Klasse B**: benötigt den blauen Schlüssel; **Belohnung: Blaue KeyCard** (Mund einer Statue bei 4990/4987) |
| Belohnung | Zauber aus den Altären (spell_20, 31, 38, 39, 46, 60, 61, 64, 65, 66, 69, 70), Stufenaufstieg +5 aus einem Kelch, Orb |

#### Fortress of Fear (Festung der Angst)

| | |
|---|---|
| Monster | Carnage Hand (7, Tier 2) · Plasmoid (58, Tier 2, zerstört Rüstung) · Mummy (47, Tier 5, Krankheit) · Mummy King (87, Tier 5, Boss) |
| Falle | **keine** |
| Stil | Riesige Steinköpfe 33 (20), **Hebel** 39 (16), Särge 62 (10, „small coffin“), Magische Runen 73, Galgen 98, Portal 3. Stille, Totenstadt. |
| Hauptquest | **Kopf-Ring-Rätsel** mit 8 echten und 8 Dummy-Hebeln (Abschnitt 2a.1). Der Sarg flüstert *„Only if the corners groan, the center will reveal my master.“*: Sitzen Köpfe in den vier Ecken des Rings, schaltet das Zentrum den Teleporter zur Schwarzen KeyCard frei. Mumien-Hinterhalte (Spawn bei 4973/5012 u. a.) stören unterwegs. [Guide: „Die Festung ist voll mit Hebeln, die zur Lösung des lokalen Rätsels benötigt werden.“] |
| Schlüsselrolle | **Klasse B**: benötigt den **orangen** Schlüssel („gelber Festungsschlüssel“ im Guide); **Belohnung: Schwarze KeyCard** (4962/5020). Die schwarze KeyCard öffnet die Pyramide (Abschnitt 5). |
| Belohnung | Särge mit 15.000 bis 20.000 Gold und Artefakten, Pearl of Youth, Tier-3-Truhe |

#### Halls of Insanity (Hallen des Wahnsinns)

| | |
|---|---|
| Monster | Mystic cloud (48, Tier 3, saugt SP) · Mini Dragon (44, Tier 3, Feuer) · Evil Eye (23, Tier 4, macht verrückt) · Eye Master (84, Tier 5, Boss) |
| Falle | **generic** (Magische Flammen 121, 9 Stück; Schaden 50 bis 500) |
| Stil | **Noble-Truhen** 72 (13, „dragon language“, verflucht), Magische Flammen 121, Löwenstatuen 27 (6, mit Inschriften), Orbs, Teleportfelder (8). Dämonische Augen-Thematik. |
| Hauptquest | Drei Rätselstatuen (`riddle_id` 8, 9, 10: *fire*, *wound*, *desire*), die die Magiefelder verschwinden lassen [Guide: AUGEN, TRÄNEN, BLINZELN]; Löwenstatuen geben Koordinaten („The treasure lies 6 West / 13 South“) zum Teleport-Schatz |
| Schlüsselrolle | **Klasse B**: benötigt den grünen Schlüssel; **Belohnung: Braune KeyCard** (Noble-Truhe bei 4991/5003) |
| Belohnung | 1.000.000 Gold (Truhe bei 4991/5024), 66.000 Gold, Artefakt des Bösen, Statue „all talents“ für Gold |

#### Dark Warriors Keep (Kriegerheim)

| | |
|---|---|
| Monster | Mad Dwarf (39, Tier 1) · Evil Ranger (24, Tier 2, Fernkampf) · Jouster (36, Tier 5) · Top Jouster (89, Tier 5, Boss) |
| Falle | **keine** Fallenaktion; [Guide] „die meisten Truhen sind tödliche Fallen“ (Truhenfallen) |
| Stil | Eisentruhen 74 (19), **Rustikale Tische** 94 (12), **Speisetische** 14 (7, leuchtend, geben Stärke/Ausdauer/Tempo), Pegasusstatuen 28 (8) mit Inschriften zu Armeen, Eisentore 81. Ordentliche Krieger = Möbel erlaubt. |
| Hauptquest | Rechenrätsel aus den Statueninschriften: *„Add the secret number to the number of Fire Helmet, Desert Wind and Shadow Grave, but subtract Ice Wing's, Green Forest's and Phantom Sorrow's.“* Antwort **159**; die Geheimzahl 29 erkennt man auf der Karte (Kartenbild, laut Nutzer). |
| Schlüsselrolle | **Klasse B**: benötigt den roten Schlüssel; **Belohnung: Grüne KeyCard** (Eisentruhe bei 4982/5033) |
| Belohnung | Speisetische: Stärke +10/+25, Ausdauer +10/+20, Tempo +20, Stufenaufstieg +2; Falltür-Truhe mit 100.000 Gold (Tier 4), Orb |

[Guide]: Rechenaufgabe-Lösung **314**, Skelette hängen an den Wänden und erhöhen die Eigenschaften. Die Remake-Karte nutzt Speisetische statt Skelette.

#### Maze from Hell (Höllenlabyrinth)

| | |
|---|---|
| Monster | Minotaur (45, Tier 5, 3.000.000 XP, tödlich) · Medusa (43, Tier 5, 3.000.000 XP, versteinert) · Minotaur King (85, Tier 5, 6.000.000 XP, Boss) |
| Falle | **keine** Fallenaktion; Saphirtruhen 96 sind versteinernd/tödlich/verrottend |
| Stil | Saphirtruhen 96 (12), Magische Runen 73 (15, **Teleporter** zurück zum Start), Orbs 109 (3), Metallstatue 61 (Titel „Perfekter Abenteurer“). Rein feindlich, keine Möbel. |
| Hauptquest | **Sprungfeld** (2a.5): Labyrinth mit 15 sichtbaren Runen-Teleportern, die zum Start zurückschicken; durchkommen nur, wer sie mit Sprung oder Teleport überspringt. Ziel ist die Statue „Perfect Adventurer“. Monster-Hindernisse 26 (34) öffnen den Weg nur nach Kampf. |
| Schlüsselrolle | **Klasse B**: benötigt den **goldenen** Schlüssel (aus der Magic Cavern); **Belohnung: Lila KeyCard** (4972/5009) |
| Belohnung | Saphirtruhen Tier 5 mit 2000 Gold + 4 bis 5 Gegenstände, Titel Perfect Adventurer (öffnet Tomb-of-Terror-Throne und im Guide den Zugang zum letzten Abschnitt) |

#### Tomb of Terror (Grab des Terrors)

| | |
|---|---|
| Monster | Untote: Skeleton (64) · Zombie (80) · Ghoul (29) · Mummy (47) · Ghost (28) · Reaper (60) · Vampire (73) · Phantom (55) · Lich (38); Boss **Vampire King** (90, Tier 5, Van Enosh). Original hat 9 Typen; als Theme sinnvoll sind 4 [Entwurf]: Skeleton/Zombie (Fußvolk), Ghoul/Ghost, Boss Vampire King. |
| Falle | **Goldraub** (`steal_gold`, 5 Stück, je **vor einer Tür**: Schattenhände greifen 1000 Gold; Fallenzellen 4970, 4976, 4982, 4988, 4994 / 5016, Türen jeweils eine Zelle südlich) |
| Stil | Verschlossene Steinsärge 127 (11), Eisentore 81 (8), Statuenköpfe 29 (4, Plaketten), **böse Throne** 6 (4, nur für Perfekte Abenteurer), Orbs 109 (2). Grüfte und Mausoleum. |
| Hauptquest | **keine** (Nutzer: „kein Quest“). Optional: Sarg bei 4969/5028 öffnen, Van Enosh (Vampire King) erscheint („You dare to disturb me?“); Throne (Aktion 53 „Special: Tomb of Terror“) nur mit Titel Perfect Adventurer. Der Reiz ist das Durchkämpfen und die Goldraub-Fallen. |
| Schlüsselrolle | **Klasse B**: benötigt den schwarzen Schlüssel; **keine KeyCard** |
| Belohnung | Särge mit Zaubern (spell_71, 78), Artefakten (gut/böse), Tier-5-Sarg (5 Gegenstände), Orb |

[Guide]: Auf dem Gipfel in F2, die Pyramide dort führt in den Hauptantriebssektor.

---

### 4.3 Dungeons unter Städten und Burgen (Klasse A, Nebenorte)

Diese Höhlen und Kerker sind nur über Städte bzw. Burgen erreichbar und enthalten **keine** Schlüssel/KeyCards. Sie sind als Themes für **kleine Orts-Dungeons** (20 × 20) brauchbar.

| Dungeon (Zugang) | Monster (ID, Tier) | Falle | Stil (Item-IDs) | Quest / Besonderheit |
|---|---|---|---|---|
| **Fountain Head Cavern** (Stadt) | Vampire Bat (74, 1) · Moose Rat (46, 1) · Goblin (31, 1) · Rat Overlord (91, 2, Boss) | Beil (6, Schaden 5) | Fässer 5 (26), rustikale Laternen 76, Mining tools 12, Abandoned fireplace 71, Zerbrochene Gefäße 83, Statuenköpfe 29 | Rätselstatue, Talente (Orientierung, Schwimmer), Silberne Schädel in Fässern. Einsteiger-Goblin-Höhle: Fässer und Kamin erlaubt. |
| **Baywatch Cavern** (Wachbucht) | Screamer (62, 1) · Bubble Man (4, 1) · Phantom (55, 3, Boss) | Grube (17, Schaden 50) + 1 Säuremagie | Säurepfützen 92 (24), **Hängende Skelette** 93 (19, verwahren Gegenstände und Hinweiszettel) | Mönchsquest (Bruder Beta → Gamma), Silberner Schädel |
| **Blistering Heights Cavern** (Glutgipfel) | Fire Stalker (26, 3) · Scorpia (61, 2) · Major Devil (42, 5, Boss) | **generic Feuer** (19 Lavapfützen 120, Schaden 100) | Lavapfützen 120, Noble-Truhen 72 (6), 4 Altäre 35, die der Gruppe Resistenzen +20 geben (Magie, Eis, Säure, Feuer) | Elementar-Altäre |
| **Swamp Town Cavern** (Sumpfstadt) | Phantom (55, 3) · Scorpia (61, 2) · Reaper (60, 4, erscheint per Spawn) | **generic Magie** (Magische Flammen 121 ×10, Schaden 50) | Särge 62 (16), Magische Flammen 121, Altäre 35: Göttin Quessidron (Ausdauer +20) und Kaltara (Stärke +20) | Gildenstufe 4 als Talent |
| **Wildabar Cavern** (Wildabar) | Ogre (51, 1) · Phase Head (56, 2) · Wicked Witch (77, 3, Boss) | über Hebel: **Multi-Trap-Placer** (4) | Eisentore 81 (21), Fässer 5 (15, geben Attribute +5/+10), Hebel 39 (4), Maskottchen Fee und Esel | Hebel schalten Türen und Fallen; Mönchsquest (Delta → Epsilon) |
| **Dragontooth Dungeon** (Burg Dragontooth) | Wicked Witch (77, 3) · Ghost (28, 4) · Spirit Shield (67, 4) | **Speer** (7, Schaden 50) | Rustikale Laternen 76 (19), Alte Bücherregale 97 (10), Bücherregale 75, Alchemietische 15, Zerbrochene Gefäße 83, Becken gelb 88 (Hexen-Kessel), Galgen 98 | Hexenstil: Regale erlaubt (Magier!). Becken geben +50 auf ein Attribut oder +5 Stufen, Altern 10 |
| **Whiteshield Dungeon** (Burg Whiteshield) | Evil Ranger (24, 2) · Major Demon (41, 4) · Major Devil (42, 5) | **Beil** (7, Schaden 50) | Knochenhaufen 70 (9, Gnomenskelette mit Zetteln), Kelche 86 (5, „King Zealot's elixir“), Eisentor 81 | Buchstabenrätsel: neun Zettel „The first one is C …“ ergeben **CHAINMAIL** (Antwort der Frage „Which item did the gnomes try to steal …“) |
| **Bloodreign Dungeon** (Burg Bloodreign) | Sonic Ninja (65, 3) · Spirit Shield (67, 4) · Draconi (20, 3) | **generic Feuer** (Magische Flammen ×15, Schaden 50) | Magische Flammen 121, Neutrale Banner 104 (5), Hängende Skelette 93 (4, mit Koordinatenzetteln), Kristalle 117 (3, +50 Tempo/Genauigkeit/Glück), Maskottchen Orb und Wolf | Koordinatenrätsel („1 North, 7 East“, „If you see the banner, you are looking North“) |

---

## 5. Pyramide und Spaceship (Klasse C und D)

**Pyramide [Karte]:** Item 43 auf `Outside` bei 4994/5030, die Eingangszelle davor (4993/5030) enthält den Map-Transfer nach `Space Ship` mit `required_item_type: quest_black_keycard`. Die schwarze KeyCard liegt in der Fortress of Fear (Klasse B). **Zusätzlich liegt eine schwarze KeyCard frei auf der Zelle 4992/5030**, direkt vor dem Eingang (Aktion 12, Item 64, `remove_item: yes`). Damit ist das Spaceship in der Kampagne ohne Dungeon erreichbar, das widerspricht der Kette in 1.2 und ist vermutlich ein Test-Überbleibsel.
Texte: eligible 392, nicht eligible 393, Rückweg 394.

**Spaceship (Klasse D) [Karte]:** Die Kampagnenkarte `Space Ship` (75 × 29) ist ein Rohbau: keine Monster, nur Cyber-Wände (Item 84/85, 185 Stück), Kraftquellenkristalle 67 (10), Transporter 40 (4), Statuen 29/27, Amethyst-Altäre 35 (8), Kelche 86 (4), Riesenköpfe 33, Fässer 5; eine einzige Aktion (Ausgang).

**Spaceship-Regeln [Entwurf nach Nutzervorgabe und Guide]:**

1. Nie Schlüssel, nie KeyCards.
2. **Hohe Belohnungen**: laut Nutzer „wie im Original, z. B. +1 Mio. XP oder Loot-Level 5“. Der Guide belegt das Muster: in den Sektoren Kelche mit „ein paar Millionen Erfahrungspunkten“ (Zentralkontrollsektor), Edelsteinaltare mit dauerhaften Wertsteigerungen (Lagersektor 2), je Sektor mehrere Königskugeln der Macht, eine Transportkiste, die an fast jeden Ort teleportiert.
3. Stil: `cyber`/`construct`-Gruppe (Terminator 69, Titanic Automaton 88, Phase Head 56, Plasmoid 58), keine organischen Props.
4. Hauptquest: Codes und Passwörter aus Kristallen/Terminals (Guide: ANFANG, WARP, UNTEREBENE, JUGEND, ERBAUER), verknüpft mit anderen Dungeons.
5. Gefahr: Kristalle in den Gängen lassen die Gruppe um 5 Jahre altern (Guide), Kristalle in den Westräumen sind harmlos und liefern Rätselcodes.

---

## 6. Vorlage für ein neues Theme

```
Theme: <Name>
Klasse: A | B     Schlüssel (nötig / enthalten): <Farbe> / <Schlüssel | KeyCard | nichts>
Bewohner-Klasse (Abschnitt 3): <Insekten | Goblinoide | Menschen | Magier | Untote | Feuer | Drachen | Konstrukte>
Monster (2 bis 4): <ID Name (Tier)>, Boss: <ID>
Falle: <guillotine | spring | pit | generic(fire/ice/acid/magic) | steal_gold | keine>
Stil (erlaubt): <Item-IDs>        Verboten: <Item-IDs>
Hauptquest: <Baustein aus Abschnitt 2 + Zahlen aus dem Level>
Belohnung: <Gold | Truhenlevel | Attribute | Zauber | Talent | Schlüssel/KeyCard laut Klasse>
Prüfung: Schlüsselregeln 1 bis 6 bestanden, Stil-Matrix eingehalten, Antworten zählbar im Level.
```

---

## 7. Abweichungen zwischen Original (Guide) und Remake (Karte)

| Thema | Original [Guide] | Remake [Karte] |
|---|---|---|
| Arachnoid-Rätsel | Lord Might beginnt, alphabetisch, Ergebnis 20301, Belohnung 1 Mio. XP, Aufladen für 5000 Edelsteine | Lord Personality beginnt (10), Ergebnis 39, Aufladen für 1.000.000 Gold |
| Dark Warriors Keep | Rechenaufgabe → 314, Skelette an den Wänden erhöhen Werte | Rechenaufgabe → 159, Speisetische erhöhen Werte |
| Schlüsselfarben | „gelber“ Festungsschlüssel, blauer „unheiliger“ Schlüssel, grüner „Augapfelschlüssel“ | orange / blau / grün (`quest_key_*`) |
| Pyramiden | vier Pyramiden, alle mit der **goldenen** Schlüsselkarte (aus A4 / Schlüsselsteinberg) | eine Pyramide mit der **schwarzen** KeyCard; die anderen KeyCards sind unbelegt |
| Spaceship | mehrere Sektoren mit Rätseln und hohen EP-Belohnungen | Platzhalterkarte ohne Quest |
| Orbs | 31 „Königskugeln der Macht“ für drei Könige | `Orb of ultimate power` (Item 109, `quest_orb`) in Dragon Cavern, Cathedral, Halls, Dark Warriors Keep, Maze from Hell, Tomb of Terror |
| Cave 01 bis 03, Slithercult, Temple of Moo | Teil der Oberwelt-Dungeons | Klasse A ohne Schlüssel |

---

## 8. Offene Punkte (brauchen eine Entscheidung des Nutzers)

1. **KeyCard-Farben ↔ Pyramiden:** Soll jede Farbe eine eigene Pyramide haben (Entwurf), oder öffnet eine Farbe wie im Guide alle? Kampagne bindet nur Schwarz.
2. **Mehrere Schlüssel pro Klasse-A-Dungeon:** Arachnoid und Cyclops geben je zwei Farben. Darf der Generator das auch (Annahme: ja, 0 bis 2)?
3. **Tomb of Terror hat 9 Monstertypen** (Regel „2 bis 4“): Soll das Theme im Generator auf 4 reduziert werden (Vorschlag in 4.2)?
4. **Spaceship-Quests:** Die Karte liefert keine. Soll ich Spaceship-Themes aus dem Guide ableiten (Passwörter, Kristallcodes), oder reicht „hohe Belohnung, keine Quest“?
5. **Dungeons unter Städten/Burgen (4.3):** Sollen auch sie Themes werden, oder nur die Hauptdungeons 4.1 und 4.2?
6. **Zwei Datenfehler der Kampagne** (nicht von mir geändert, `old_code` ist schreibgeschützt): `quest_key_bronze` statt `quest_key_orange` in der Arachnoid Cavern (Fortress of Fear unerreichbar) und die freie schwarze KeyCard neben der Pyramide. Soll ich sie in den Kampagnendaten des Neubaus (`game/`) korrigieren? Das wäre eine eigene Aufgabe.
**Entschieden (Nutzer):** Die Kathedrale-Antwort `jvciii` ist ein Easteregg und wird ignoriert. Vierter Kelch der Kathedrale = Fehler in den Altdaten (richtig: N W S E N). Kartenbild-Rätsel (Zahlen oder Buchstaben) werden als Rätseltyp angeboten (2a.6). Maze from Hell: Teleporter sind sichtbar. Dragon Cavern und Tomb of Terror: kein Quest.
7. **Thron-ID:** Du schriebst „Thron (ID 45)“. In den Kartendaten ist der Thron Item **30** („Throne (Good)“); die 45 ist seine Rotation (`ir`). Item 45 wäre eine „Hut“. Lord = 52 stimmt.

---

## 9. Umsetzung im Generator (`GEN_VERSION` 9)

Jede Höhle und jeder Dungeon der generierten Welt hat ein Theme aus diesem Katalog. Der Katalog selbst steht als Daten in `src/data/dungeon-themes.ts` (23 Themes: die Hauptdungeons aus 4.1 und 4.2, die kleinen Orts-Dungeons aus 4.3, das Versteck aus „Cave 01 bis 03“ und die Pyramide). Zur Umsetzung gehören die Dateien `src/interiors/dungeonPlan.ts` (Zuteilung, Schlüsselkette), `src/actions/rules.ts`, `questGen.ts`, `questChecks.ts`, `quests.ts` (Inhalt, Rätsel, Prüfung, Zustand) und `src/render/interiorProps.ts` (Darstellung).

### 9.1 Entscheidungen zu den offenen Punkten (Abschnitt 8)

| Punkt | Entscheidung |
|---|---|
| 1. KeyCard ↔ Pyramide | Jede KeyCard-Farbe öffnet genau eine Pyramide (Entwurf). |
| 2. Mehrere Schlüssel | Ja, 0 bis 2 je Klasse-A-Dungeon (Arachnoid blau + orange, Cyclops grün + rot). |
| 3. Tomb of Terror | Auf Skeleton, Zombie, Ghost und den Boss Vampire King verkleinert. |
| 4. Spaceship | Das Spaceship ist das Innere der Pyramide (`cyber`, Konstrukte, keine organischen Props) und zahlt hoch: Lootstufe +3, Gold ×5 und 2 bis 3 Kelche mit je 1.000.000 Erfahrung. **Keine Quest**, keine Passwörter aus dem Guide. |
| 5. Orts-Dungeons (4.3) | Sind Themes für kleine Orte (je mit eigenem Tierfenster `tier`). Die Namen der Orte bleiben die der Weltgenerierung; der Themenname erscheint nur in der Beschreibung beim Betreten. |
| 6. Datenfehler der Kampagne | **Nicht geändert.** Der Generator hat einen Typ je Schlüssel, ein Test prüft Fundort und Tür gegen `QUEST_ITEMS` (Regel 7). |

Die Pyramide ist ein gewöhnlicher Dungeon-Ort der Überwelt (kein neuer Ortstyp, `PoiKind` ist unverändert). Sie braucht eine KeyCard und ist ab Tier 4 möglich. Das zufällige Cyber-Theme der Dungeons (15 % ab Tier 4) gibt es nicht mehr.

### 9.2 Zuteilung und Schlüsselkette

`planRegion(world, rx, ry)` plant alle Höhlen und Dungeons einer **Region** gemeinsam. Ein Ort will Klasse B (33 %) oder bei Tier ab 4 eine Pyramide (15 %), sonst ist er frei. Die Reihenfolge ist: erst die freien Orte (sie halten die Schlüssel), dann die Schlüssel-Dungeons (nur mit Farben, die ein freier Ort der Region hält, jede Farbe einmal), dann die Pyramiden (nur mit KeyCards, die ein Schlüssel-Dungeon der Region hält, jede einmal). Wo das nicht geht, wird der Ort ein freier. Damit ist **jede Tür der Region lösbar**; `checkKeyChain` prüft die Regeln 4 bis 6 für eine Liste von Orten, `validateContent` die Regeln 1 bis 3 und 7 für den Inhalt eines Ortes (`themeIssues`). Orte außerhalb eines Regionsplans (Tests mit erfundenen POIs) sind freie Orte.

Der Eingang prüft den Gegenstand in `Game.promptEnterPoi` (`hasItem`); er wird nicht verbraucht. Schlüssel und KeyCard liegen in einer eigenen Truhe (`quest`-Parameter der Aktion `treasure`): Schlüssel am Ende eines Seitengangs, die KeyCard im Bossraum (Fortress of Fear und Cathedral of Carnage: in der Truhe ihres Rätsels).

### 9.3 Inhalt eines Ortes

Der Regelmotor kennt das Theme einer Karte (`map.dungeon`) und ersetzt damit: die Monstergruppen und den Boss (`themeMonsters`, `themeBoss`: Monster bis zum Tier, der Boss eine Stufe darüber, sonst der stärkste passende), die Falle (genau eine Art oder keine, Schaden aus `src/data/rules/traps.json`, das Element der `generic`-Falle steht im Theme), die Truhen- und Schreinobjekte (Truhenmodell, Kristall, Altar, Brunnen, Kelch) sowie die Beute (Lootstufe und Gold-Anteil des Themes). Neu ist die Aktion `decor`: Props nach Abschnitt 3 (Regeln `decor_*` in `dungeon.json` und `cave.json`), die beim Anstoßen sagen, was sie sind, und die Zelle sperren, wenn das Altitem ein Hindernis ist. Die Stilmatrix aus Abschnitt 3 ist `FORBIDDEN_PROPS`; Test und `themeIssues` prüfen, dass nichts darin vorkommt.

Rätselobjekte nehmen die Altitems: Statue 28/27/61/29, Gong 118, Hebel 39, Köpfe 33 und 29, Kelche 86, Runen 73.

### 9.4 Rätsel

| Baustein (Abschnitt 2) | Themes | Umsetzung |
|---|---|---|
| Rätselstatue | Cursed Cold Cavern (4), Fountain Head (2) | Aktion `riddle` mit Frage und Antwort aus `RIDDLES_MASTER`; die Antwort tippt der Spieler ein (Groß-/Kleinschreibung und Artikel egal), richtig zahlt einmal aus, falsch kostet nichts. |
| Koordinatenschatz | Halls of Insanity, Bloodreign | Zwei Statuen nennen „N West und M Süd von dieser Statue“; dort liegt eine Truhe der nächsthöheren Lootstufe. Reichweite 30 Zellen. |
| Gongs + Lord | Arachnoid Cavern | Vier Gongs rufen je einmal Monster. Drei Statuen nennen die Rechnung („Start mit S“, „addiere g je Gong“, „ziehe c je Kristall ab“), der Lord (erst nach dem vierten Gong ansprechbar) will das Ergebnis. Die Zahlen sind im Level zählbar (Gongs, Kristalle). |
| Kartenbild | Dark Warriors Keep | In der Halle (13 × 11) zeichnen Wände zwei Ziffern, auf der Spielerkarte lesbar (Pixelschrift 3 × 5, `interiors/glyphs.ts`). Die Statue will die Zahl. **Nur die Ziffern 1, 2, 3, 4, 5, 7:** 0, 6, 8 und 9 schließen Bodenzellen ein, die dann unerreichbar wären. |
| Sprungfeld | Slithercult Stronghold (unsichtbare Teleporter + Beile), Maze from Hell (sichtbare Runen) | Halle mit zwei Truhen in der Mitte. Etwa 38 % der Zellen sind Gefahr (Aktion `teleporter` wirft zur Tür der Halle zurück, die Rückkehrzelle liegt außerhalb des Feldes, nicht im Gefahrenbereich); ein sicherer Weg zu den Truhen ist garantiert (Test: Breitensuche). Ein Hinweis liegt an der Tür. |
| Kopf-Ring | Fortress of Fear | Acht Köpfe (Item 33) ringförmig um die Truhe in der Mitte, acht echte und etwa acht falsche Hebel (alle Item 39) verteilt auf die anderen Räume. Ein echter Hebel setzt oder entfernt seinen Kopf. **Die vier Ecken müssen Köpfe tragen** (wie der Prüfer des Altspiels, die Kanten zählen nicht). Köpfe sperren ihre Zelle nur, solange sie stehen (`ringBlocked`, `Game.syncQuestBlocks`). Die Truhe enthält die KeyCard und bleibt bis dahin zu. |
| Kopf-Drehung | Cathedral of Carnage | Fünf drehbare Köpfe (Item 29) in einer Reihe, darunter fünf Kelche (Item 86), die die Himmelsrichtung nennen. Anstoßen dreht einen Kopf um eine Viertelrunde. Sind alle Köpfe richtig gestellt, öffnet sich die KeyCard-Truhe. **Abweichung vom Altspiel:** Die Richtung ist direkt die, in die der Kopf schaut; die verdrehte Zuordnung der Altdaten (Rotationswert ≠ Blickrichtung) und die Strafen beim Trinken fehlen. |
| Einmal-Hebel | Wildabar Cavern | **Nicht gebaut.** Das Theme hat die Quest `levers`, der Generator ignoriert sie (`QUEST_BUILT`). |
| Mönchskette, Gruppenwerte aus Kristallen | – | Nicht gebaut. Kristalle und Altäre sind Schreine mit Attribut- oder Resistenzgewinn. |

Der Zustand der Rätsel steht in der Menge der benutzten Aktionen des Spielstands (`state.opened`, siehe Kopf von `actions/quests.ts`): erledigte Statuen und Gongs mit ihrer uid, gezogene Hebel mit ihrer uid, gedrehte Köpfe als `<uid>=<Richtung>`. Ein neues Feld im Spielstand gibt es nicht.

`questIssues` (`actions/questChecks.ts`, Teil von `validateContent`) prüft für jeden erzeugten Ort, dass sein Rätsel lösbar ist: Antwort gleich Tabelle bzw. Rechnung bzw. gezeichneter Zahl, jede Ringzelle hat ihren Hebel, der Ring beginnt nicht schon richtig und lässt die Mitte erreichbar, jede Truhe des Sprungfelds hat einen sicheren Weg, die Kelche zeigen die Richtungen der Köpfe. `tests/unit/dungeonQuests.test.ts` spielt jedes Rätsel über `resolveAction` durch.

### 9.5 Was bewusst fehlt

- Zweite Etage: Die Pyramide ist **ein** Ort, dessen Inneres das Spaceship ist (wie auf der Kampagnenkarte, wo die Pyramide direkt nach `Space Ship` führt). Mehrstöckige Dungeons gibt es weiterhin nicht.
- Die Zauber Sprung und Teleport werden für das Sprungfeld nicht vorausgesetzt (der sichere Weg ist begehbar); sie sparen nur Umwege. Der Zauber-Fundort (Regel 2 der Prüfungen in 2a.5) ist nicht erzwungen.
- Die Kampagnenkarten sind unverändert (Datenfehler Bronze/Orange, freie schwarze KeyCard vor der Pyramide).

---
### 9.x Nachtrag 2026-10-20 (`GEN_VERSION` 14): die Objektliste des Nutzers

Die Props, Truhen, Schreine und Quest-Objekte der Themes folgen jetzt der Liste `.ignore/items.xlsx` (`src/data/item-rules.ts`, siehe HANDOVER „Achtzehnter Playtest“, Punkt 12): ein Objekt nur in den Orten, die die Liste nennt, ein zwingend funktionales nie als reine Deko. Folgen für die Themes:

- Aus den Prop-Listen fielen: Säurepfützen, Lavapfützen, Magische Flammen, Metalltore und Kelche (funktional), Bücherregale, Pegasus, Banner, Laternen und das hängende Skelett in Höhlen (nicht erlaubt), Orb und Banner im Dungeon, Raumschiff-Objekte außerhalb der Pyramide. Die Listen der Höhlen bekamen erlaubte Ersatzobjekte, die zu den Bewohnern passen (`FORBIDDEN_PROPS` gilt weiter), z. B. Werkzeug, Lagergerät, Schädel auf dem Spieß, Kamin, Knochenhaufen, Gräber.
- **Ein Fass ist ein Behälter**, nie Deko: wo ein Theme es als Prop nennt (Hideout, Fountain Head Cavern, Wildabar Cavern), ist es eine `treasure`-Aktion mit ein paar Münzen oder einem Witz.
- Chest der Blistering Heights Cavern: Eisentruhe (74) statt der edlen (72, nur Burg, Dungeon, Stadt); Chest der Pyramide: Computerterminal (68), die Raumschiff-Liste kennt keine Truhe.
- Rätsel: Statuen für Rätsel, Hinweise und Lords in Höhlen sind die Steinstatue (95) oder der Steinkopf (33), im Dungeon wie bisher (28, 27, 61, 29); Gongs (118) sind in Höhlen erlaubt (Korrektur des Nutzers, `ADD_PLACES` im Exporter, `docs/OBJECTS.md`): die Arachnoid Cavern schlägt Gongs wie die Dungeons; die Schlüssel-Truhe zeigt den Schlüssel (17 bis 25) nur in Burg und Dungeon.
- Verkäufer: Die Altäre (Fountain Head Cavern) und die Lords (Arachnoid Cavern) verkaufen nichts mehr in Höhlen; Orientation, Perceptive und Swimmer verkaufen Karawanen, die Lords stehen in Burgen (Persona 52 ist nur dort und in Städten erlaubt).

## Anhang A: Monster der Dungeons

Alle Monster, die in den 24 Dungeon-Karten der Kampagne vorkommen (ohne Städte, Burgen, Oberwelt, Spaceship). Sortiert nach Tier, dann XP. „Gruppe“ ist die Einteilung des Generators (`src/data/monsterThemes.json`); sie ist nicht dieselbe wie die Familie in Abschnitt 3, wird aber als Ausgangspunkt benutzt. Bosse stehen mit dem Dungeon, in dem sie vorkommen. Zusätzlich im Spiel: Vampire King (90, Tier 5, 300.000 XP) als Boss der Tomb of Terror (per Spawn, nicht auf der Karte platziert).

| ID | Monster | Tier | XP | Gruppe (`monsterThemes.json`) | Besonderheit | Vorkommen in |
|---|---|---|---|---|---|---|
| 4 | Bubble Man | 1 | 250 | construct | Ranged Attack | Baywatch Cavern |
| 74 | Vampire Bat | 1 | 250 | beast | Causes Poisoned | Fountain Head Cavern |
| 31 | Goblin | 1 | 400 | humanoid | Ranged Attack | Fountain Head Cavern |
| 53 | Orc Warrior | 1 | 600 | humanoid | Ranged Attack | Cave 03 |
| 64 | Skeleton | 1 | 1,000 | undead | Undead | Slithercult Stronghold, Temple of Moo, Tomb of Terror |
| 46 | Moose Rat | 1 | 1,200 | beast | None | Fountain Head Cavern |
| 62 | Screamer | 1 | 1,750 | beast | Causes Crazy | Baywatch Cavern |
| 80 | Zombie | 1 | 1,800 | undead | Causes Diseased | Temple of Moo, Tomb of Terror |
| 78 | Wild Fungus | 1 | 2,000 | beast | Hits All | Cyclops Cavern |
| 39 | Mad Dwarf | 1 | 2,500 | humanoid | None | Dark Warriors Keep |
| 51 | Ogre | 1 | 2,500 | humanoid | Ranged Attack, Break Armor | Wildabar Cavern |
| 30 | Giant Spider | 1 | 3,000 | beast | Causes Poisoned | Arachnoid Cavern |
| 6 | Candle Creep | 1 | 3,000 | fire | Ranged Attack | Slithercult Stronghold |
| 18 | Dino Beetle | 2 | 4,000 | beast | None | Arachnoid Cavern |
| 5 | Bugaboo | 2 | 4,000 | beast | Resists Magic | Cyclops Cavern |
| 10 | Cobra Fiend | 2 | 4,000 | beast, desert | Causes Sleeping | Slithercult Stronghold |
| 56 | Phase Head | 2 | 4,000 | cyber | Causes Crazy | Wildabar Cavern |
| 61 | Scorpia | 2 | 5,000 | beast, desert | Causes Poisoned | Blistering Heights Cavern, Swamp Town Cavern |
| 58 | Plasmoid | 2 | 8,000 | construct | Break Armor | Fortress of Fear |
| 91 | Rat Overlord | 2 | 8,000 | beast | None | Fountain Head Cavern |
| 7 | Carnage Hand | 2 | 10,000 | undead | Resists Magic | Cursed Cold Cavern, Fortress of Fear |
| 24 | Evil Ranger | 2 | 12,000 | humanoid | Ranged Attack | Dark Warriors Keep, Slithercult Stronghold, Whiteshield Dungeon |
| 55 | Phantom | 3 | 16,000 | undead | Aging Touch(+5) | Baywatch Cavern, Swamp Town Cavern, Tomb of Terror |
| 77 | Wicked Witch | 3 | 16,000 | humanoid | Ranged Attack, Curses Equipment | Cursed Cold Cavern, Dragontooth Dungeon, Wildabar Cavern |
| 29 | Ghoul | 3 | 16,000 | undead | Causes Weak | Tomb of Terror |
| 44 | Mini Dragon | 3 | 18,000 | fire | Ranged Attack | Halls of Insanity |
| 20 | Draconi | 3 | 20,000 | humanoid, beast, desert | None | Bloodreign Dungeon, Dragon Cavern |
| 65 | Sonic Ninja | 3 | 20,000 | humanoid | None | Bloodreign Dungeon |
| 26 | Fire Stalker | 3 | 30,000 | fire | None | Blistering Heights Cavern |
| 27 | Gargoyle | 3 | 30,000 | construct | Causes Paralyzed | Cathedral of Carnage |
| 48 | Mystic cloud | 3 | 30,000 | cold | Drains Spell Points | Halls of Insanity |
| 81 | Cult Leader | 3 | 30,000 | humanoid | Ranged Attack, Targets Druids | Slithercult Stronghold |
| 9 | Cleric of Moo | 3 | 32,000 | humanoid | Ranged Attack, Hits All | Cathedral of Carnage, Temple of Moo |
| 28 | Ghost | 4 | 32,000 | undead | Undead, Aging Touch(+5) | Dragontooth Dungeon, Tomb of Terror |
| 34 | Guardian | 4 | 40,000 | construct | None | Magic Cavern |
| 66 | Sorcerer | 4 | 50,000 | cold | Ranged Attack | Magic Cavern |
| 60 | Reaper | 4 | 50,000 | undead | Ranged Attack | Swamp Town Cavern, Tomb of Terror |
| 67 | Spirit Shield | 4 | 60,000 | construct | None | Bloodreign Dungeon, Dragontooth Dungeon |
| 23 | Evil Eye | 4 | 60,000 | undead | Causes Crazy | Halls of Insanity |
| 70 | Toxic worm | 4 | 90,000 | beast | Causes Poisoned | Arachnoid Cavern |
| 86 | Moo Master | 4 | 100,000 | humanoid | Ranged Attack, Hits All | Cathedral of Carnage |
| 3 | Black Knight | 4 | 100,000 | humanoid | Ranged Attack, Causes Weak, Hatred:Paladins | Cursed Cold Cavern |
| 41 | Major Demon | 4 | 100,000 | fire | Causes Paralyzed | Whiteshield Dungeon |
| 59 | Priest of Moo | 5 | 120,000 | humanoid | None | Cathedral of Carnage |
| 47 | Mummy | 5 | 120,000 | undead, desert | Causes Diseased | Fortress of Fear, Tomb of Terror |
| 84 | Eye Master | 5 | 120,000 | undead | Causes Crazy | Halls of Insanity |
| 38 | Lich | 5 | 120,000 | undead | Causes Dead | Magic Cavern, Tomb of Terror |
| 13 | Cyclops | 5 | 150,000 | humanoid | Causes Crazy | Cyclops Cavern |
| 36 | Jouster | 5 | 180,000 | humanoid | None | Dark Warriors Keep |
| 42 | Major Devil | 5 | 250,000 | fire | Causes Unconscious | Blistering Heights Cavern, Whiteshield Dungeon |
| 87 | Mummy King | 5 | 250,000 | undead, desert | Causes Diseased | Fortress of Fear |
| 73 | Vampire | 5 | 250,000 | undead | Drains Spell Points | Tomb of Terror |
| 82 | Cyclops King | 5 | 300,000 | humanoid | Causes Crazy | Cyclops Cavern |
| 89 | Top Jouster | 5 | 300,000 | humanoid | None | Dark Warriors Keep |
| 33 | Green Dragon | 5 | 500,000 | cold | Ranged Attack | Dragon Cavern |
| 83 | Dragon Lord | 5 | 500,000 | fire | Ranged Attack, Causes Fire Damage | Dragon Cavern |
| 43 | Medusa | 5 | 3,000,000 | beast | Ranged Attack, Causes Petrified | Maze from Hell |
| 45 | Minotaur | 5 | 3,000,000 | beast | Causes Dead | Maze from Hell |
| 85 | Minotaur King | 5 | 6,000,000 | beast | Causes Dead, Resists Magic | Maze from Hell |

## Anhang B: Props der Dungeons

Alle Item-IDs, die in mindestens einem Dungeon der Kampagne stehen, mit der Zahl der Dungeons, in denen sie vorkommen. Namen aus `ITEMS.json`. Wo ein Prop in genau einem Dungeon vorkommt, ist er thematisch an diesen gebunden (Abschnitt 4).

| Item-ID | Name | Dungeons (Anzahl) |
|---|---|---|
| 1 | Chest: Wooden | 6 |
| 3 | Portal | 1 |
| 4 | Treasure | 1 |
| 5 | Barrel | 2 |
| 6 | Throne (Evil) | 1 |
| 8 | Mascot: Donkey | 1 |
| 9 | Mascot: Fairy | 1 |
| 10 | Mascot: Magical Orb | 1 |
| 11 | Mascot: Wolf | 1 |
| 12 | Mining tools | 1 |
| 14 | Table with food | 1 |
| 15 | Alchemy table | 1 |
| 17 | Quest key blue | 1 |
| 18 | Quest key black | 1 |
| 21 | Quest key green | 1 |
| 22 | Quest key orange | 1 |
| 23 | Quest key red | 1 |
| 27 | Statue: Lion | 2 |
| 28 | Statue: Pegasus | 2 |
| 29 | Statue: Head | 4 |
| 30 | Throne (Good) | 1 |
| 33 | Giant stone head | 1 |
| 35 | Amethyst altar | 4 |
| 37 | Magic well red | 3 |
| 38 | Skull on a spike | 1 |
| 39 | Lever | 4 |
| 50 | Persona (Guild Apprentice) | 1 |
| 52 | Persona (Lord) | 1 |
| 53 | Persona (Monk) | 3 |
| 61 | Statue: Metal | 1 |
| 62 | Coffin | 2 |
| 64 | Quest: Key card (black) | 1 |
| 70 | Bone pile | 4 |
| 71 | Abandoned fireplace | 1 |
| 72 | Chest: Noble | 2 |
| 73 | Magic runes | 6 |
| 74 | Chest: Iron | 4 |
| 75 | Book shelf | 2 |
| 76 | Rustic lantern | 2 |
| 77 | Trap door | 1 |
| 81 | Metal Gate | 10 |
| 83 | Fractured vessels | 3 |
| 86 | Chalice | 2 |
| 87 | Guillotine trap | 4 |
| 88 | Magic well yellow | 5 |
| 90 | Persona (Seth Squirm) | 1 |
| 92 | Acid puddle | 2 |
| 93 | Hanging Skeleton | 2 |
| 94 | Rustic Table | 1 |
| 96 | Chest: Sapphire | 1 |
| 97 | Book shelf (old) | 1 |
| 98 | Gallow | 2 |
| 104 | Decoration: Neutral Banner | 1 |
| 105 | Decoration: Evil Banner | 2 |
| 109 | Orb of ultimate power | 6 |
| 117 | Crystals | 2 |
| 118 | Gong | 1 |
| 119 | Lectern | 1 |
| 120 | Lava puddle | 1 |
| 121 | Magic flames | 4 |
| 123 | Quest: Key card (purple) | 1 |
| 125 | Decoration: Moose King | 1 |
| 127 | Stone coffin locked | 2 |
