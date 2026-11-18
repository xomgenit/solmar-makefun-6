# SOLMAR — Streets of the Sun

An original 2D top-down open-world crime game set in Solmar Bay. Built for
make.fun's "Make GTA 6" bounty (gta6-01). Canvas, no engine, 100% offline —
no network requests, no external assets; all sound is WebAudio-synthesised.

You are Danny "Dice" Marlow, back in Solmar Bay. Fixer Vera Santos has work,
the Harbor Kings run the docks, and the SBPD is watching. Steal cars, outrun
the law, take jobs, and own the city — one mission at a time.

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
