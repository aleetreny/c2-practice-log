const C2_EXAM_METADATA = {
  useOfEnglish: {
    name: "Use of English",
    description: "Grammar & Vocabulary (Parts 1, 2, 3, 4)",
    maxMarks: 36,
    parts: {
      part1: {
        name: "Part 1 - Multiple-choice cloze",
        startQ: 1,
        endQ: 8,
        type: "mcq",
        options: ["A", "B", "C", "D"],
        weight: 1
      },
      part2: {
        name: "Part 2 - Open cloze",
        startQ: 9,
        endQ: 16,
        type: "text",
        weight: 1
      },
      part3: {
        name: "Part 3 - Word formation",
        startQ: 17,
        endQ: 24,
        type: "text",
        weight: 1
      },
      part4: {
        name: "Part 4 - Key word transformation",
        startQ: 25,
        endQ: 30,
        type: "partial", // 0, 1, or 2 marks
        weight: 2
      }
    }
  },
  reading: {
    name: "Reading",
    description: "Reading Comprehension (Parts 5, 6, 7)",
    maxMarks: 36,
    parts: {
      part5: {
        name: "Part 5 - Multiple choice",
        startQ: 31,
        endQ: 36,
        type: "mcq",
        options: ["A", "B", "C", "D"],
        weight: 2 // 2 marks per question
      },
      part6: {
        name: "Part 6 - Gapped text",
        startQ: 37,
        endQ: 43,
        type: "dropdown",
        options: ["A", "B", "C", "D", "E", "F", "G", "H"],
        weight: 2 // 2 marks per question
      },
      part7: {
        name: "Part 7 - Multiple matching",
        startQ: 44,
        endQ: 53,
        type: "dropdown",
        options: ["A", "B", "C", "D", "E", "F", "G", "H"],
        weight: 1
      }
    }
  },
  listening: {
    name: "Listening",
    description: "Listening Comprehension (Parts 1, 2, 3, 4)",
    maxMarks: 30,
    parts: {
      part1: {
        name: "Part 1 - Multiple choice",
        startQ: 54,
        endQ: 59,
        type: "mcq",
        options: ["A", "B", "C"],
        weight: 1
      },
      part2: {
        name: "Part 2 - Sentence completion",
        startQ: 60,
        endQ: 68,
        type: "text",
        weight: 1
      },
      part3: {
        name: "Part 3 - Multiple choice",
        startQ: 69,
        endQ: 73,
        type: "mcq",
        options: ["A", "B", "C", "D"],
        weight: 1
      },
      part4: {
        name: "Part 4 - Multiple matching",
        startQ: 74,
        endQ: 83,
        type: "dropdown",
        options: ["A", "B", "C", "D", "E", "F", "G", "H"],
        weight: 1
      }
    }
  },
  writing: {
    name: "Writing",
    description: "Writing Tasks (Parts 1, 2)",
    maxMarks: 40,
    parts: {
      part1: {
        name: "Part 1 - Compulsory Essay",
        type: "writing",
        minW: 240,
        maxW: 280,
        weight: 20
      },
      part2: {
        name: "Part 2 - Optional Writing",
        type: "writing",
        minW: 280,
        maxW: 320,
        weight: 20
      }
    }
  }
};
