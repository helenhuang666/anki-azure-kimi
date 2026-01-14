function resolvePhoneme(p, index, phonemes, word) {
  const ipa = p.Phoneme;

  const next = phonemes[index + 1]?.Phoneme || "";
  const prev = phonemes[index - 1]?.Phoneme || "";

  // ---------- r ----------
  if (ipa === "ɹ") {
    const isInitial = next && isVowel(next);
    return {
      key: isInitial ? "r_initial" : "r_final",
      display: "r",
    };
  }

  // ---------- l ----------
  if (ipa === "l") {
    const isLight = next && isVowel(next);
    return {
      key: isLight ? "l_light" : "l_dark",
      display: "l",
    };
  }

  // ---------- default ----------
  return {
    key: ipa,
    display: ipa,
  };
}

function isVowel(ipa) {
  return /[aeiouɑɔəɜɪʊ]/.test(ipa);
}
