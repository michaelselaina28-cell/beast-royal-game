import { ANIMAL_LIST } from "@game/animals";
import { MODE_INFO } from "@game/protocol";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { AnimalArt } from "../components/AnimalArt";

export function Home() {
  const featured = ANIMAL_LIST.filter((animal) => ["lion", "tiger", "crocodile"].includes(animal.id));

  return (
    <div className="page home-page">
      <section className="home-stage">
        <div className="home-intro">
          <div className="kicker"><span className="live-dot" /> The arena is open</div>
          <h2>Pick your beast.<br /><span>Own the clash.</span></h2>
          <p className="lede">
            Read the room. Lock your move. Survive the shrinking wild with a crew of up to eight.
          </p>
          <div className="cta-row home-actions">
            <Link className="btn btn-gold" to="/play">Play now</Link>
            <Link className="btn btn-ghost" to="/create">Create a room</Link>
            <Link className="btn btn-ghost" to="/join">Join with a code</Link>
          </div>
          <div className="home-facts" aria-label={`${ANIMAL_LIST.length} animals and three ways to play`}>
            <div><strong>{ANIMAL_LIST.length}</strong><span>playable beasts</span></div>
            <div><strong>2–8</strong><span>hunters per den</span></div>
            <div><strong>3</strong><span>ways to clash</span></div>
          </div>
        </div>

        <aside className="home-roster" aria-label="Featured beasts">
          <div className="roster-heading">
            <div>
              <span className="kicker">Fighter select</span>
              <h3>Choose your edge</h3>
            </div>
            <Link to="/roster">Full roster <span aria-hidden>↗</span></Link>
          </div>
          <div className="featured-list">
            {featured.map((animal, index) => (
              <Link key={animal.id} to="/roster" className="featured-animal" style={{ "--animal-accent": animal.accent } as CSSProperties}>
                <AnimalArt id={animal.id} size={76} />
                <span className="featured-copy">
                  <span className="featured-index">0{index + 1} / {animal.role}</span>
                  <strong>{animal.name}</strong>
                  <span>{animal.special}</span>
                </span>
                <span className="featured-arrow" aria-hidden>↗</span>
              </Link>
            ))}
          </div>
        </aside>
      </section>

      <section className="home-lower">
        <div className="section-heading">
          <div>
            <span className="kicker">Choose your drop</span>
            <h3>Three ways into the wild</h3>
          </div>
          <Link to="/modes">Explore all modes <span aria-hidden>↗</span></Link>
        </div>
        <div className="mode-list">
          {Object.entries(MODE_INFO).slice(0, 3).map(([id, mode], index) => (
            <Link className="mode-row" to="/modes" key={id}>
              <span className="mode-number">0{index + 1}</span>
              <span className="mode-copy"><strong>{mode.name}</strong><span>{mode.blurb}</span></span>
              <span className="mode-players">{mode.min}–{mode.max} players</span>
              <span className="featured-arrow" aria-hidden>↗</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
