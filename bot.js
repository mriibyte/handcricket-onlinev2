// Bot AI for singleplayer. The bot plays like a human: weighted random picks
// with a bit of "read your opponent" logic at higher difficulties.

function weightedPick(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return Number(k);
  }
  return 1;
}

// Batters historically favour 1, 2, 4, 6; bowlers guess accordingly.
const BATTER_WEIGHTS = { 1: 3, 2: 2.4, 3: 1.4, 4: 2.2, 5: 1, 6: 1.8 };
const GUESS_WEIGHTS = { 1: 2.4, 2: 2, 3: 1.5, 4: 1.9, 5: 1.2, 6: 1.6 };

function botTossCall(difficulty) {
  return Math.random() < 0.5 ? "e" : "o";
}

function botTossNumber() {
  return 1 + Math.floor(Math.random() * 10);
}

function botBatBowlChoice(difficulty) {
  // Bots like to set a total — bat first more often than not.
  return Math.random() < 0.65 ? "bat" : "bowl";
}

// batting: true → the bot is picking a shot; false → the bot is picking a delivery.
// oppHistory: numbers the human picked, most recent last.
function botBallPick(difficulty, batting, oppHistory) {
  const hist = oppHistory.slice(-10);
  if (difficulty === "easy") {
    return weightedPick(batting ? BATTER_WEIGHTS : GUESS_WEIGHTS);
  }

  if (difficulty === "medium") {
    // Mostly natural, occasionally counter the human's favourite number.
    if (hist.length >= 3 && Math.random() < 0.25) {
      const freq = {};
      hist.forEach((n) => (freq[n] = (freq[n] || 0) + 1));
      const best = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
      return Number(best);
    }
    return weightedPick(batting ? BATTER_WEIGHTS : GUESS_WEIGHTS);
  }

  // hard: read patterns (human repeat / avoid-repeat tendencies) + chase pressure.
  if (hist.length >= 2 && Math.random() < 0.45) {
    const last = hist[hist.length - 1];
    // Humans rarely repeat the exact same number — eliminate it from the guess space.
    const weights = { ...GUESS_WEIGHTS };
    if (batting) {
      // Predicting what the bowler will deliver: weight towards likely guesses.
      return weightedPick(weights);
    }
    // Bowling: try to match the batter. Downweight their last number slightly,
    // boost numbers they used often.
    delete weights[last];
    const freq = {};
    hist.forEach((n) => (freq[n] = (freq[n] || 0) + 1));
    for (const n of Object.keys(weights)) {
      weights[n] *= 1 + (freq[n] || 0) * 0.35;
    }
    return weightedPick(weights);
  }
  return weightedPick(batting ? BATTER_WEIGHTS : GUESS_WEIGHTS);
}

module.exports = { botTossCall, botTossNumber, botBatBowlChoice, botBallPick };
