// High-level Olympiad syllabus reference content, shown on the public/authed
// Syllabus page. This is independent from `topics.js` (which drives question
// filtering) — it's a broader "what's covered" reference for parents and
// students, not tied 1:1 to internal topic ids.
//
// Shape: SYLLABUS[grade][subjectKey] = [ { heading, items: [string, ...] } ]
// Each item is "Term: description" where possible — the UI bolds the part
// before the first colon.

export const SYLLABUS = {
  4: {
    math: [
      {
        heading: "Number System & Place Value",
        items: [
          "5-digit numbers: Reading and writing 5-digit and larger numbers.",
          "Place value and face value: Distinguishing a digit's value by position vs. the digit itself.",
          "Expanded form and standard form: Writing numbers as sums of place values and back.",
          "Comparing and ordering numbers: Ascending and descending order.",
          "Roman numerals: Reading and writing Roman numerals.",
          "Factors and multiples: Prime, composite, LCM, and HCF.",
        ],
      },
      {
        heading: "Computation Operations",
        items: [
          "Advanced addition and subtraction of large numbers.",
          "Multiplication and division of large numbers.",
          "Word problems based on arithmetic operations.",
          "Order of operations: BODMAS rules.",
        ],
      },
      {
        heading: "Fractions and Decimals",
        items: [
          "Types of fractions: Proper, improper, mixed, and equivalent.",
          "Addition and subtraction of like fractions.",
          "Introduction to decimals and their visual representation.",
        ],
      },
      {
        heading: "Geometry and Shapes",
        items: [
          "Lines and curves: Line segments, rays, and open/closed curves.",
          "2D shapes: Properties of squares, rectangles, triangles, and circles.",
          "3D solids: Identifying cubes, cuboids, spheres, cylinders, and cones.",
          "Perimeter: Perimeter of various shapes.",
          "Symmetry: Line of symmetry.",
        ],
      },
      {
        heading: "Measurement and Conversions",
        items: [
          "Measuring length, weight, and capacity/volume.",
          "Unit conversion: e.g., meters to kilometers, grams to kilograms.",
        ],
      },
      {
        heading: "Time, Money, and Calendar",
        items: [
          "Reading clocks: Converting time and calculating elapsed time.",
          "Calendar: Days, dates, weeks, and leap years.",
          "Money: Calculating totals, making change, and simple bills.",
        ],
      },
      {
        heading: "Data Handling",
        items: [
          "Pictographs: Interpreting pictographs.",
          "Bar graphs: Reading and creating bar graphs.",
          "Tally marks: Tally marks and data interpretation charts.",
        ],
      },
      {
        heading: "Everyday Mathematics",
        items: [
          "Real-life problem solving: Applying arithmetic to shopping, meals, banking, or travel.",
          "Multi-step calculations: Combining multiple operations within one scenario.",
        ],
      },
    ],
    science: [
      {
        heading: "Plants",
        items: [
          "Parts of a plant: Roots, stem, leaves, flowers, and their functions.",
          "Plant survival: Adaptation in different habitats (terrestrial, aquatic).",
          "Uses of plants and fibers: Cotton, jute, linen.",
        ],
      },
      {
        heading: "Animals",
        items: [
          "Classification: Herbivores, carnivores, omnivores.",
          "Animal habits: Body coverings and adaptations.",
          "The world of birds: Beaks, claws, nests, and flight.",
        ],
      },
      {
        heading: "Food and Digestion",
        items: [
          "Components of food: Carbohydrates, proteins, fats, vitamins, minerals.",
          "Balanced diet: Deficiency diseases.",
          "Human digestive system: The process of digestion.",
        ],
      },
      {
        heading: "Human Needs and Body",
        items: [
          "Body systems: Basic overview of organ systems.",
          "Clothes we wear: Seasonal clothing choices.",
          "Health, safety, and hygiene rules.",
        ],
      },
      {
        heading: "Matter and Materials",
        items: [
          "States of matter: Solid, liquid, gas, and their properties.",
          "Materials: Solubility and basic solutions.",
        ],
      },
      {
        heading: "Force, Work, and Energy",
        items: [
          "Push and pull: Force as a push or pull.",
          "Friction: Friction as a force and its effects.",
          "Energy: Light and shadow formation.",
          "Simple machines.",
        ],
      },
      {
        heading: "Our Environment",
        items: [
          "Living and non-living things: Their relationship.",
          "Air, atmosphere, and weather.",
          "Natural resources: Pollution prevention.",
        ],
      },
      {
        heading: "Earth and Universe",
        items: [
          "Movement of the Earth: Rotation and revolution and their effects.",
          "Earth and its neighbors: The solar system and moon phases.",
        ],
      },
    ],
    reasoning: [
      {
        heading: "Verbal Reasoning",
        items: [
          "Alphabet test: Arranging letters, decoding words, finding words within words.",
          "Coding-decoding: Substituting numbers or codes for words.",
          "Ranking test: Finding a position from left/right or top/bottom.",
          "Direction sense: Navigating north, south, east, and west paths.",
          "Analogy and classification: Grouping items or matching pairs by relationship.",
          "Blood relations: Deciphering family structures and relationships.",
        ],
      },
      {
        heading: "Non-Verbal Reasoning",
        items: [
          "Patterns: Shape sequences, figure completions, and series continuation.",
          "Mirror and water images: Visualizing inverted configurations.",
          "Embedded figures: Finding a smaller shape hidden inside a complex illustration.",
          "Geometrical solids: Counting faces, edges, or hidden blocks.",
          "Possible combinations: Permutation arrangements of colors, numbers, or objects.",
        ],
      },
    ],
    english: [
      {
        heading: "Grammar and Mechanics",
        items: [
          "Nouns: Proper, common, collective, material, abstract, countable, uncountable.",
          "Pronouns: Personal, possessive, demonstrative, reflexive.",
          "Verbs: Action verbs, helping verbs, basic modal verbs.",
          "Tenses: Present, past, and future (simple and continuous forms).",
          "Adjectives: Qualitative, quantitative, demonstrative, possessive, degrees of comparison.",
          "Adverbs: Manner, place, time, and frequency.",
          "Articles: Definite (the) and indefinite (a, an).",
          "Prepositions: Direction, position, time, and place.",
          "Conjunctions: Coordinating conjunctions (and, but, or, so, because).",
          "Punctuation: Capital letters, full stops, commas, question marks, apostrophes.",
          "Sentences: Subject/predicate, jumbled words, sentence types.",
        ],
      },
      {
        heading: "Vocabulary Enhancement",
        items: [
          "Synonyms & antonyms: Words with similar or opposite meanings.",
          "Homophones & homographs: Same sound or same spelling, different meaning.",
          "Collocations: Common word pairings (e.g., \"make a mistake\").",
          "Idioms & proverbs: Age-appropriate expressions and figurative meanings.",
          "One-word substitutions: Replacing a phrase with a single word.",
          "Spellings: Identifying correct and incorrect spellings.",
          "Anagrams & word ladders: Word puzzles and letter rearrangements.",
        ],
      },
      {
        heading: "Reading Comprehension",
        items: [
          "Fact extraction: Locating direct information from short stories or essays.",
          "Inference: Understanding meanings or emotions not stated directly.",
          "Context clues: Guessing unfamiliar word meanings from surrounding text.",
          "Sequencing: Arranging events from a passage in chronological order.",
          "Poetry: Comprehending short, age-appropriate poems and rhyme schemes.",
        ],
      },
      {
        heading: "Spoken and Written Expression",
        items: [
          "Conversational English: Appropriate responses for requests, apologies, greetings.",
          "Functional language: Invitations, formal notices, phone calls, buying items.",
        ],
      },
    ],
  },

  6: {
    math: [
      {
        heading: "Number System & Arithmetic",
        items: [
          "Knowing our numbers: Large numbers up to 8 digits, estimation, place value, Roman numerals.",
          "Whole numbers: Properties (closure, commutative, associative, distributive), number line.",
          "Playing with numbers: Factors, multiples, prime/composite numbers, divisibility rules, HCF and LCM word problems.",
          "Integers: Negative numbers, absolute value, operations on integers.",
          "Fractions & decimals: Types of fractions, conversion, operations, decimal word problems.",
          "Ratio and proportion: Unitary method, direct proportions.",
          "Commercial math: Percentages, simple profit & loss calculations.",
        ],
      },
      {
        heading: "Algebra & Geometry",
        items: [
          "Introduction to algebra: Variables, constants, algebraic expressions, basic linear equations.",
          "Basic geometrical ideas: Points, lines, line segments, rays, intersecting/parallel lines, curves.",
          "Understanding shapes: Polygons, triangles, quadrilaterals, 3D shapes (prisms, pyramids, cones).",
          "Symmetry & practical geometry: Line and rotational symmetry, ruler-and-compass constructions.",
        ],
      },
      {
        heading: "Mensuration & Data Handling",
        items: [
          "Perimeter and area: Squares, rectangles, regular polygons, composite figures.",
          "Data handling: Collection and organization, pictographs, bar graphs, complex data maps.",
        ],
      },
    ],
    science: [
      {
        heading: "Physics",
        items: [
          "Motion & measurement: Types of motion, units of measurement, standard conversions.",
          "Light, shadows, & reflections: Luminous vs. non-luminous, transparent/translucent/opaque, pinhole camera, reflection.",
          "Electricity & circuits: Electric cell, open vs. closed circuits, switches, conductors, insulators.",
          "Fun with magnets: Magnetic materials, poles, compass, demagnetization.",
        ],
      },
      {
        heading: "Chemistry",
        items: [
          "Sorting & separation of materials: Hardness, solubility, luster; separation methods.",
          "Changes around us: Reversible/irreversible, physical vs. chemical change, expansion/contraction.",
          "Natural resources (water & air): Water cycle, composition of air, pollution, conservation.",
        ],
      },
      {
        heading: "Biology",
        items: [
          "Food and its components: Nutrients, balanced diet, deficiency diseases.",
          "Fibre to fabric: Natural vs. synthetic fibers, processing steps (ginning, spinning, weaving).",
          "Living world & diversity: Characteristics of living organisms, plant anatomy, animal movement.",
          "Habitats & adaptations: Terrestrial, aquatic, aerial environments; survival mechanisms.",
        ],
      },
    ],
    reasoning: [
      {
        heading: "Verbal Reasoning",
        items: [
          "Series completion: Number and alpha-numeric patterns.",
          "Coding-decoding: Letter shifting, substitution codes, number coding.",
          "Blood relations & ranking: Family trees, positional rankings in a row.",
          "Direction sense: Compass orientation and distance mapping.",
          "Analogy & classification: Logical links, identifying the odd one out.",
        ],
      },
      {
        heading: "Non-Verbal Reasoning",
        items: [
          "Visual logic: Figure matrix completion, embedded figures, grouping identical figures.",
          "Spatial operations: Paper folding, paper cutting, cube and dice rotations.",
          "Mirror & water images: Lateral inversion and vertical flipping.",
        ],
      },
    ],
    english: [
      {
        heading: "Core Areas",
        items: [
          "Word & structure knowledge: Parts of speech, tenses, voice, narration, collocations, idioms, synonyms/antonyms.",
          "Reading comprehension: Brochures, itineraries, news stories, letters, timetables.",
          "Spoken & written expression: Situational communication — requests, refusals, apologies, agreements.",
        ],
      },
    ],
  },
};

export const SYLLABUS_GRADES = Object.keys(SYLLABUS).map(Number).sort((a, b) => a - b);
