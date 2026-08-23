// Maps AI waste categories to the correct segregated dustbin per Indian
// municipal solid waste (MSW) rules: green = wet/organic, blue = dry
// recyclable, yellow/black = domestic hazardous, red = biomedical.
const BIN_MAP = {
  organic_waste: {
    bin: "green",
    binLabel: "Green Bin — Wet Waste",
    color: "#16A34A",
    handling: "Compostable. Route to organic composting / biogas facility.",
  },
  plastic_waste: {
    bin: "blue",
    binLabel: "Blue Bin — Dry Recyclable",
    color: "#2563EB",
    handling: "Rinse and segregate recyclables; route to material recovery facility (MRF).",
  },
  garbage_dump: {
    bin: "blue",
    binLabel: "Blue Bin — Dry Waste (mixed)",
    color: "#2563EB",
    handling: "Segregate on-site: recyclables to blue, soiled fraction to green/black.",
  },
  overflowing_bin: {
    bin: "matching",
    binLabel: "Match the existing bin type",
    color: "#64748B",
    handling: "Empty into the collection vehicle of the same stream; do not mix streams.",
  },
  construction_debris: {
    bin: "none",
    binLabel: "No household bin — C&D debris",
    color: "#B45309",
    handling: "Inert debris. Transport to designated construction & demolition waste facility.",
  },
  e_waste: {
    bin: "yellow",
    binLabel: "Yellow Bin — E-Waste Drop-off",
    color: "#CA8A04",
    handling: "Do not compact. Hand over to authorised e-waste recycler (EPR route).",
  },
  hazardous_waste: {
    bin: "yellow",
    binLabel: "Yellow Bin — Domestic Hazardous",
    color: "#CA8A04",
    handling: "PPE required. Hand over to authorised hazardous-waste handler; never mix with wet/dry.",
  },
  drain_blockage: {
    bin: "none",
    binLabel: "No bin — silt removal",
    color: "#B45309",
    handling: "Collected silt goes to debris/silt yard, not to household bins.",
  },
  other: {
    bin: "blue",
    binLabel: "Blue Bin — Mixed Waste",
    color: "#2563EB",
    handling: "Mixed waste. Segregate recyclables to blue; residual fraction to green/black at transfer station.",
  },
};

export function getBinGuidance(wasteType) {
  const key = String(wasteType || "").toLowerCase();
  return (
    BIN_MAP[key] || {
      bin: "blue",
      binLabel: "Blue Bin — Dry Waste (default)",
      color: "#2563EB",
      handling: "Unknown category — segregate at transfer station before disposal.",
    }
  );
}

export const BIN_TYPES = Object.fromEntries(
  Object.entries(BIN_MAP).map(([k, v]) => [k, v.bin])
);
