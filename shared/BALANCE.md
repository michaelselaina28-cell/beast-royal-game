# Balance defaults (canonical tunables)

Rulebook numbers (HP/ATK/DEF/SPD, Stampede 60%, Poison 8/3, Death Roll CD 3, betrayal +25%, bounty +30 energy/+10 HP, zone schedule, Recover 15/20, energy regen 10) are implemented exactly.

Defaults chosen where the rulebook was qualitative:

| Knob | Value | Notes |
| --- | --- | --- |
| Special energy costs | 20–40 | See each animal in `animals.ts` |
| Most special cooldowns | 1–2 (Crocodile 3) | |
| Role triangle bonus | 8% | Complements, does not replace, specials |
| Eagle vs snake / cat vs bird | 10% | Tag table in `matchups.ts` |
| Hippo counter | 55% ATK | |
| Eagle counter | 60% ATK | |
| Fox evade / decoy | 35% / 40% | Evolved decoy 55% |
| Eagle evade | 40% (+35% on cliff) | Evolved 55% |
| Scorpion stun | 40% (evolved 60%) | No consecutive stuns |
| Cheetah sprint | speed +100 | Always first |
| Bee overuse | self 10 from 2nd consecutive Swarm | Evolved 5 |
| KOTH win | 12 points, 2 per center occupancy | |
| Weather | every 3 rounds, lasts 2 | Storm +20% dmg |
| Boss Mammoth / Rex | 820/740 HP | Fail at round 16 |
| XP | 40 play + 120 win + 25/kill | Level curve 120×1.35^(lv-1) |
| Decision timers | 10s classic, 5s speed | Server owned |
