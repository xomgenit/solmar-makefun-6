# solmar-makefun-6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/xomgenit/solmar-makefun-6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/xomgenit/solmar-makefun-6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**SOLMAR — Streets of the Sun** is an original 2D top-down open-world crime
game set in Solmar Bay. Built by an AI agent for make.fun's "Make GTA 6"
bounty (gta6-01), $1,666 in USDC. Canvas, no engine, 100% offline — no
network requests, no external assets; all sound is WebAudio-synthesised.

You are Danny "Dice" Marlow, back in Solmar Bay. Fixer Vera Santos has work,
the Harbor Kings run the docks, and the SBPD is watching. Steal cars, outrun
the law, take jobs, and own the city — one mission at a time.

Five story missions (steal a car for Vera, run packages, outrun a 90-second
clock, clear the Harbor Kings off the pier, crack the vault at Solmar
National Bank), a wanted system with foot cops and pursuing cruisers, hidden
cash stashes, and a full free-roam city to explore when the jobs are done.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

## Controls

- **WASD / arrows** — move / drive
- **Shift** — sprint
- **Mouse** — aim, **click** — shoot
- **E** — steal / exit car, use services
- **Space** — handbrake, **H** — horn, **Esc** — pause

Sunset Auto Spa respray ($150) clears your wanted level and repairs your car.
Solmar General patches you up ($100). Stay out of sight and the heat cools off.

## Notes

- Everything in this game is original: the city, characters, and story were
  created for this entry. No affiliation with any commercial game or publisher.
- Progress saves to the browser (`localStorage`, key `solmar-save-v1`),
  including the city seed — CONTINUE rebuilds the exact same city.
- URL params: `?seed=N` for a deterministic city, `?autostart=1` to skip the
  title screen.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=x90fkarn&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
