import React from "react";

export default function HomeCards({ cards = [] }) {
  if (!cards.length) return null;

  return (
    <div className="cards-panel">
      {cards.map((card, idx) => (
        <div className="home-card" key={`${card.title}-${idx}`}>
          <div className="home-card-title">{card.title}</div>
          {(card.items || []).map((item, i) => (
            <div className="home-card-item" key={`${item}-${i}`}>
              • {item}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
