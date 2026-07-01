// Curated from the user's "My Writing Bank" Notion export.
// Repeated material is consolidated around the decision a student needs to make while writing.

const WRITING_ESSAY_STAGES = [
  {
    id: "frame",
    paragraph: "P1",
    title: "Frame the debate",
    role: "Introduce the shared topic, distinguish the two angles and state your provisional judgement.",
    target: "45–55 words",
    moves: ["Shared issue", "Text 1 angle", "Text 2 angle", "Your thesis"],
    example: "The two texts address the impact of remote work, albeit from different angles. While the first foregrounds flexibility and productivity, the second draws attention to isolation and weaker collaboration. Although both concerns have merit, the second is ultimately more convincing because it addresses the conditions under which performance can be sustained."
  },
  {
    id: "text-one",
    paragraph: "P2",
    title: "Evaluate Text 1",
    role: "Paraphrase its central claim, explain why it matters and identify one limitation.",
    target: "60–70 words",
    moves: ["Accurate paraphrase", "Support or implication", "Limitation"],
    example: "The first text rightly points out that greater autonomy can make employees more efficient. This argument carries weight, particularly for workers whose concentration is disrupted by a busy office. However, it arguably underestimates the extent to which such gains depend on adequate space, reliable technology and a clear separation between work and home life."
  },
  {
    id: "text-two",
    paragraph: "P3",
    title: "Evaluate Text 2 and connect",
    role: "Present the second author fairly, contrast it with Text 1 and show how the two positions relate.",
    target: "65–75 words",
    moves: ["Text 2 claim", "Contrast", "Evaluation", "Synthesis"],
    example: "The second text, by contrast, argues that informal contact is essential to creativity and morale. This perspective is persuasive insofar as it recognises forms of collaboration that are difficult to schedule online. Even so, physical presence alone does not guarantee meaningful exchange. Taken together, the texts reveal that the real tension is not between home and office, but between individual focus and collective energy."
  },
  {
    id: "judgement",
    paragraph: "P4",
    title: "Reach a qualified judgement",
    role: "Weigh both texts, prioritise one consideration and close on the real challenge rather than repeating the introduction.",
    target: "45–55 words",
    moves: ["Synthesis", "Priority", "Reason", "Final reframing"],
    example: "On balance, flexibility should be preserved, but not treated as an end in itself. The second text identifies the more decisive consideration because sustained collaboration requires deliberate support. Ultimately, the issue is not where people work, but how autonomy can be maintained without allowing professional relationships and shared learning to erode."
  }
];

const WRITING_ESSAY_SITUATIONS = [
  {
    id: "open-debate",
    group: "orient",
    title: "Open the shared debate",
    cue: "Both texts discuss the same broad issue.",
    positions: ["P1"],
    phrases: [
      "The two texts address the broader issue of [topic], albeit from different angles.",
      "At the heart of both texts lies the question of whether [A] should take precedence over [B].",
      "Both authors engage with [topic], though they frame the central difficulty in markedly different ways."
    ]
  },
  {
    id: "text-one",
    group: "orient",
    title: "Present Text 1",
    cue: "Report the first author's idea without copying it.",
    positions: ["P1", "P2"],
    phrases: [
      "The first text foregrounds [idea/factor].",
      "Its central claim is that [paraphrase].",
      "The first author maintains that [claim], placing particular emphasis on [factor]."
    ]
  },
  {
    id: "text-two",
    group: "orient",
    title: "Introduce Text 2",
    cue: "Signal a new author and the relationship to Text 1.",
    positions: ["P1", "P3"],
    phrases: [
      "The second text, by contrast, draws attention to [factor].",
      "A rather different emphasis appears in the second text, which foregrounds [idea].",
      "The second author approaches the issue from the standpoint of [perspective]."
    ]
  },
  {
    id: "direct-contrast",
    group: "compare",
    title: "Show direct contrast",
    cue: "The authors prioritise opposing factors.",
    positions: ["P1", "P3"],
    phrases: [
      "Whereas the first author treats [A] as the principal concern, the second assigns greater weight to [B].",
      "This stands in sharp contrast to the first text, which assumes that [claim].",
      "The authors are therefore at odds over whether [point of disagreement]."
    ]
  },
  {
    id: "shared-ground",
    group: "compare",
    title: "Identify shared ground",
    cue: "The texts disagree, but share an assumption or goal.",
    positions: ["P3", "P4"],
    phrases: [
      "Despite their different emphases, both texts acknowledge that [shared point].",
      "What both authors take for granted is that [shared assumption].",
      "The two positions converge on the need to [shared goal], even if they differ over how this should be achieved."
    ]
  },
  {
    id: "synthesise",
    group: "compare",
    title: "Synthesize the texts",
    cue: "Move beyond A versus B and show the larger relationship.",
    positions: ["P3", "P4"],
    phrases: [
      "Taken together, the texts reveal an underlying tension between [A] and [B].",
      "Rather than being mutually exclusive, these positions may in fact be complementary.",
      "The debate is therefore less straightforward than either text initially suggests."
    ]
  },
  {
    id: "support",
    group: "evaluate",
    title: "Support an author's idea",
    cue: "Explain why a claim is relevant or convincing.",
    positions: ["P2", "P3"],
    phrases: [
      "This argument carries considerable weight, particularly when one considers [example/implication].",
      "The author is right to underscore [factor], since [reason].",
      "This line of reasoning is broadly persuasive insofar as it recognises [important nuance]."
    ]
  },
  {
    id: "challenge",
    group: "evaluate",
    title: "Challenge an assumption",
    cue: "The conclusion depends on something questionable.",
    positions: ["P2", "P3"],
    phrases: [
      "This conclusion rests on the questionable assumption that [assumption].",
      "The difficulty with this position is that it treats [variable issue] as though it were [fixed/simple].",
      "This view is difficult to sustain in contexts where [limiting condition]."
    ]
  },
  {
    id: "omission",
    group: "evaluate",
    title: "Expose an omission",
    cue: "The author ignores a relevant group, condition or consequence.",
    positions: ["P2", "P3"],
    phrases: [
      "This, however, overlooks the fact that [missing factor].",
      "What the argument fails to account for is [omission].",
      "The text arguably underestimates the extent to which [factor changes the issue]."
    ]
  },
  {
    id: "concede",
    group: "nuance",
    title: "Concede without surrendering",
    cue: "Accept part of a point before qualifying it.",
    positions: ["P2", "P3", "P4"],
    phrases: [
      "Admittedly, [valid point]. Even so, [stronger counterpoint].",
      "While this argument is broadly persuasive, it fails to account for [limitation].",
      "To some extent, this is true; nevertheless, much depends on whether [condition]."
    ]
  },
  {
    id: "scope",
    group: "nuance",
    title: "Limit the scope of a claim",
    cue: "The idea works only in some circumstances.",
    positions: ["P2", "P3"],
    phrases: [
      "The argument is strongest when applied to [context], but less convincing where [different context].",
      "Its validity depends largely on whether [condition].",
      "This may hold true for [group], but it cannot readily be generalised to [other group]."
    ]
  },
  {
    id: "cause",
    group: "reason",
    title: "Explain a cause",
    cue: "Show where a problem or tendency comes from.",
    positions: ["P2", "P3"],
    phrases: [
      "This appears to stem largely from [cause].",
      "The tendency can be attributed, at least in part, to [cause].",
      "A likely explanation is that [cause/explanation]."
    ]
  },
  {
    id: "consequence",
    group: "reason",
    title: "Develop a consequence",
    cue: "Move from assertion to wider significance.",
    positions: ["P2", "P3"],
    phrases: [
      "This has far-reaching implications for [group/area].",
      "Taken too far, this approach is liable to lead to [negative result].",
      "In the longer term, it may foster [benefit] / exacerbate [problem]."
    ]
  },
  {
    id: "example",
    group: "reason",
    title: "Add an example without narrating",
    cue: "Illustrate the claim briefly and analytically.",
    positions: ["P2", "P3"],
    phrases: [
      "A case in point is [brief example], which illustrates how [link to claim].",
      "This is particularly evident in [context], where [concise evidence].",
      "Consider, for instance, [example]; the wider implication is that [analysis]."
    ]
  },
  {
    id: "trade-off",
    group: "reason",
    title: "Express a trade-off",
    cue: "A benefit may undermine another value.",
    positions: ["P3", "P4"],
    phrases: [
      "The real difficulty lies in determining how far [measure] can be pursued without jeopardising [value].",
      "Although [benefit] is undeniable, it may come at the cost of [loss].",
      "A defensible response must therefore strike a balance between [A] and [B]."
    ]
  },
  {
    id: "priority",
    group: "position",
    title: "Prioritise one argument",
    cue: "Both have merit, but one matters more.",
    positions: ["P1", "P4"],
    phrases: [
      "For this reason, [factor] deserves to be treated as the more pressing concern.",
      "On balance, priority should be given to [position], chiefly because [reason].",
      "[A] should not be dismissed; nevertheless, [B] remains the more decisive consideration."
    ]
  },
  {
    id: "own-position",
    group: "position",
    title: "State a nuanced position",
    cue: "Give a clear view without sounding absolute.",
    positions: ["P1", "P4"],
    phrases: [
      "A more defensible position would be that [qualified view].",
      "In my view, the strongest response is to [position], provided that [condition].",
      "To reduce the issue to a simple either-or choice would be misleading; [your synthesis]."
    ]
  },
  {
    id: "close",
    group: "position",
    title: "Close with authority",
    cue: "Reframe the challenge instead of repeating the thesis.",
    positions: ["P4"],
    phrases: [
      "Ultimately, the issue is not whether [A], but how [A] can be pursued without undermining [B].",
      "In the final analysis, the real challenge lies in [problem to solve] rather than in [false choice].",
      "What matters most is whether [approach] remains both workable and justifiable in practice."
    ]
  }
];

const WRITING_LANGUAGE_GROUPS = [
  {
    id: "reporting",
    title: "Report an author's position",
    note: "Use a verb that reflects the strength of the source; do not write “the text says” repeatedly.",
    items: [
      ["suggest", "suggest that", "The second author suggests that flexibility can improve retention."],
      ["maintain", "maintain that", "The first text maintains that regulation would be counterproductive."],
      ["contend", "contend that", "The author contends that public funding is a moral obligation."],
      ["foreground", "foreground + noun", "The first text foregrounds the practical benefits of early intervention."],
      ["imply", "imply that", "Both texts imply that the current system is no longer sustainable."]
    ]
  },
  {
    id: "support-verbs",
    title: "Strengthen or validate",
    note: "Useful when you explain why an author's point deserves weight.",
    items: [
      ["underscore", "underscore + importance/need", "The example underscores the need for long-term planning."],
      ["reinforce", "reinforce + claim/impression", "Recent evidence reinforces the author's central claim."],
      ["bolster", "bolster + case/argument", "The fall in costs bolsters the case for wider adoption."],
      ["substantiate", "substantiate + claim", "The text offers no data to substantiate this claim."],
      ["acknowledge", "acknowledge + limitation/fact", "The second author acknowledges the practical constraints involved."]
    ]
  },
  {
    id: "challenge-verbs",
    title: "Challenge or weaken",
    note: "Critique the reasoning, not the author personally.",
    items: [
      ["question", "question + validity/assumption", "This evidence calls the proposal's viability into question."],
      ["undermine", "undermine + argument/credibility", "The absence of a clear mechanism undermines the argument."],
      ["overlook", "overlook + factor", "The first text overlooks the unequal impact on rural communities."],
      ["underestimate", "underestimate + extent/cost", "The author underestimates the extent of the transition required."],
      ["dismiss", "dismiss + concern as...", "It would be unwise to dismiss these concerns as merely temporary."]
    ]
  },
  {
    id: "cause-verbs",
    title: "Build cause and consequence",
    note: "Choose the verb according to whether the result is neutral, positive or negative.",
    items: [
      ["stem from", "problem stems from cause", "Much of the resistance stems from limited awareness."],
      ["give rise to", "cause gives rise to result", "Poor oversight may give rise to conflicts of interest."],
      ["foster", "foster + positive development", "Shared projects can foster a stronger sense of community."],
      ["exacerbate", "exacerbate + problem", "A sudden withdrawal of funding would exacerbate existing inequalities."],
      ["render", "render + object + adjective", "Excessive complexity could render the scheme unworkable."]
    ]
  },
  {
    id: "evaluation",
    title: "Evaluate with precision",
    note: "High-level language works best when the noun collocation is natural.",
    items: [
      ["compelling", "a compelling case/justification", "The author makes a compelling case for preventive action."],
      ["nuanced", "a nuanced account/position", "The second text offers a more nuanced account of motivation."],
      ["reductive", "a reductive view of", "Treating success as a matter of income alone is reductive."],
      ["untenable", "an untenable position", "Without additional funding, this position becomes untenable."],
      ["viable", "a viable alternative/solution", "Hybrid provision may represent a more viable alternative."]
    ]
  },
  {
    id: "abstract-nouns",
    title: "Useful abstract collocations",
    note: "Use these to name the exact object of your evaluation.",
    items: [
      ["assumption", "underlying/questionable assumption", "The argument rests on an underlying assumption about human behaviour."],
      ["implications", "long-term/far-reaching implications", "The policy has far-reaching implications for social cohesion."],
      ["constraints", "practical/logistical constraints", "Its appeal must be weighed against the practical constraints."],
      ["viability", "long-term/economic viability", "The first text says little about the plan's long-term viability."],
      ["justification", "compelling/sound justification", "Convenience alone is not a sound justification for the change."]
    ]
  }
];

const WRITING_UPGRADES = [
  { plain: "important", options: "crucial · pivotal · decisive · paramount", collocation: "a decisive consideration · a matter of paramount importance" },
  { plain: "good / convincing", options: "compelling · cogent · robust · nuanced", collocation: "a compelling argument · a robust case · a nuanced account" },
  { plain: "bad / weak", options: "flawed · reductive · untenable · superficial", collocation: "a flawed assumption · an untenable position" },
  { plain: "big / small", options: "substantial · marked · negligible · marginal", collocation: "a substantial benefit · a negligible impact" },
  { plain: "clear", options: "lucid · coherent · unequivocal · unambiguous", collocation: "a coherent line of reasoning · an unequivocal recommendation" },
  { plain: "old", options: "dated · longstanding · time-honoured · obsolete", collocation: "a dated outlook · a longstanding concern" },
  { plain: "interesting", options: "thought-provoking · illuminating · engrossing", collocation: "a thought-provoking discussion · an illuminating account" },
  { plain: "attractive", options: "striking · evocative · visually arresting", collocation: "striking imagery · an evocative setting" }
];

const WRITING_GENRES = {
  report: {
    label: "Report",
    meta: "Formal · factual · headings · evaluate and recommend",
    structure: ["Aim", "Overall findings", "Strengths", "Weaknesses", "Recommendations", "Conclusion"],
    phrases: [
      ["Purpose", "The aim of this report is to assess [subject], with particular reference to [areas]."],
      ["Overview", "On the whole, [subject] proved broadly successful, despite a number of practical limitations."],
      ["Finding", "A marked preference emerged for [option], largely because [reason]."],
      ["Weakness", "Despite the favourable response, there remains clear scope for improvement in relation to [area]."],
      ["Recommendation", "Priority should therefore be given to [measure]."],
      ["Conditional close", "Should these recommendations be implemented, the programme is likely to become more effective and accessible."]
    ],
    avoid: ["Long narrative", "Personal anecdotes", "Recommendation without evidence"]
  },
  review: {
    label: "Review",
    meta: "Semi-formal · critical voice · describe briefly, then evaluate",
    structure: ["Hook", "Brief context", "Main strength", "Qualified criticism", "Recommendation"],
    phrases: [
      ["Hook", "Few [works] manage to combine [quality] with [quality], yet [title] does so with remarkable assurance."],
      ["Focus", "The plot revolves around [surface story], though the real focus is arguably on [theme]."],
      ["Strength", "Its greatest strength lies in [feature], which packs a genuine emotional punch."],
      ["Criticism", "That said, it is not without its flaws; at times, [aspect] feels somewhat [adjective]."],
      ["Relevance", "Far from feeling dated, it still resonates because [reason]."],
      ["Verdict", "For [audience], this is a thought-provoking choice that more than justifies the time invested."]
    ],
    avoid: ["Retelling the whole plot", "Only positive adjectives", "A recommendation with no target audience"]
  },
  article: {
    label: "Article",
    meta: "Semi-formal · engaging · reader-aware · memorable ending",
    structure: ["Engaging title", "Hook", "Point A", "Shift/example", "Action", "Impactful close"],
    phrases: [
      ["Title", "Why [X] matters more than ever"],
      ["Hook", "At first glance, [idea] may seem reasonable, but the reality is rather more complex."],
      ["Reader link", "You may well have experienced this yourself."],
      ["Perspective shift", "Tempting though this argument may be, it overlooks [factor]."],
      ["Action", "A sensible starting point would be to [measure]."],
      ["Close", "The real question is not whether [X] matters, but whether we are prepared to act."]
    ],
    avoid: ["Essay-style academic opening", "Too many rhetorical questions", "Formal report headings", "A long anecdote"]
  },
  formalLetter: {
    label: "Formal letter",
    meta: "Formal · diplomatic · purpose-led · no title or headings",
    structure: ["Reason for writing", "Point 1", "Point 2", "Request/recommendation", "Courteous close"],
    phrases: [
      ["Purpose", "I am writing in connection with [issue], and more specifically to [purpose]."],
      ["Acknowledge", "While I recognise the practical difficulties involved, [concern]."],
      ["Concern", "One issue that deserves particular attention is [problem]."],
      ["Consequence", "This may have adverse consequences for [group]."],
      ["Request", "I would therefore urge you to consider [measure]."],
      ["Close", "I trust that these concerns will be given due consideration."]
    ],
    avoid: ["Essay thesis", "Overly emotional accusation", "Wrong Yours faithfully/sincerely pairing"]
  },
  informalLetter: {
    label: "Informal letter",
    meta: "Natural · personal · supportive · rich but not formal",
    structure: ["React", "Point A/advice", "Point B/experience", "Practical recommendation", "Friendly close"],
    phrases: [
      ["Open", "It was great to hear from you. You asked me about [X], so I thought I would share a few ideas."],
      ["Empathise", "I can completely understand why you are unsure."],
      ["Advise", "What I would suggest is [advice]."],
      ["Experience", "I found myself in a similar situation when [brief experience]."],
      ["Reassure", "It may seem daunting at first, but [reassurance]."],
      ["Close", "Whatever you decide, let me know how it goes and do keep me posted."]
    ],
    avoid: ["Formal report language", "Generic advice with no reason", "An abrupt ending"]
  }
};

const WRITING_SAFE_EXPRESSIONS = [
  ["strike a balance between", "weigh two legitimate priorities"],
  ["come at a cost", "introduce a trade-off"],
  ["pave the way for", "describe an enabling consequence"],
  ["run the risk of", "signal a possible negative outcome"],
  ["go hand in hand with", "show two developments are linked"],
  ["take precedence over", "prioritise one consideration"],
  ["shed light on", "show that evidence clarifies an issue"],
  ["be at odds with", "show contradiction between positions"],
  ["fall short of", "evaluate a limitation"],
  ["stand the test of time", "evaluate enduring value in a review"]
];
