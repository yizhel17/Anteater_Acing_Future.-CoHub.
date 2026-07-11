import type { Role } from '@/types'

export const STUDENT_PLACEHOLDERS: Record<string, string> = {
  'ICS 31':
    "e.g., I'm taking ICS 31 this quarter — How 's the general course structure? I once heard that it's quite challenging for people who have no prior programming experience. Is that true? What Python basics should I lock in before the first lab?",
  'ICS 32':
    "e.g., I just finished ICS 31 with a B+. Struggling with IDE setup for ICS 32 — where do I start? I just checked the syllabus, and it says we need to be using git and github. What are they? Such a huge transition, is there any specific tools or libraries I should get familiar with before the quarter starts?",
  'ICS 33':
    "e.g., Taking ICS 33 next quarter! I know the jump from 32 is huge and involves a lot of OOP, generators, and iterators. Are the projects as insane as people say? Is reviewing Pattis's old notes actually worth it, and how should I prep my Python skills?",
  'ICS 45C':
    "e.g., I'm transitioning from Python in ICS 33 to C++ in 45C. Everyone says memory management and pointers are a nightmare. What's the deal with Valgrind and memory leaks? Any specific C++ syntax I should practice before Week 1?",
  'ICS 46':
    "e.g., Heading into ICS 46 and honestly a bit terrified. I hear AVL trees, hash tables, and graphs are brutal to implement in C++. Which data structures trip people up the most? Should I start reviewing Big O notation now?",
  'ICS 51':
    "e.g., I have zero hardware background and ICS 51 is my first exposure to assembly language (x86/MIPS) and caching. It feels like a completely different mindset from Python/C++. How should I prep for the assembly section to not fall behind?",
  'MATH 3A':
    "e.g., Is MATH 3A super heavy on proofs? I'm pretty strong at computation but weak on theoretical math and linear transformations. How different is it from the Calculus series, and what's the best way to study for the midterms?",
  'MATH 2B':
    "e.g., I barely scraped through MATH 2A. Everyone says MATH 2B (Integrals and Taylor Series) is the ultimate weed-out class at UCI and the common final is insanely hard. How different is it from 2A, and what's the best way to survive it?",
  'COMPSCI 161':
    "e.g., CS 161 is such a biggest fear. Dynamic Programming and the Master Theorem make zero sense to me. How do people actually practice for Eppstein/Goodrich's brutal exams?",
  'COMPSCI 122A':
    'e.g., Taking CS 122A (Carey). The relational algebra and E-R diagrams look like a totally different language from SQL. Does anyone have tips for the midterm?',
  'ICS 53':
    'e.g., Heading into ICS 53 with Harris. I hear the C programming and socket/server multi-threading projects are absolute nightmare fuel. How do I survive this class?',
  'STATS 67':
    "e.g., Taking Stats 67. I haven't done stats since high school. Is it heavy on calculus, or more about discrete probability and Bayes' Theorem?",
  'MATH 2A':
    'e.g., Taking Math 2A this quarter. I think I kinda forget some of the calculus basics. How do I survive the related rates and optimization word problems? Is the common final really that bad?',
  'PHYSICS 7C':
    'e.g., Physics 7C is destroying me. The MasteringPhysics homework takes hours and the midterm averages are so low. How do I actually understand rotational kinematics and torque?',
  'CHEM 1A':
    'e.g., Freshman taking Chem 1A (Arasasingham). The ALEKS homework modules are endless. Is the curve generous, and what should I strictly focus on for the final?',
  'CHEM 51A':
    "e.g., Starting O-Chem (Chem 51A) with King. I'm terrified. How do you even begin to memorize all the nomenclature, stereochemistry, and resonance structures?",
  'BIO SCI 93':
    'e.g., Bio 93 with the Trio. There is so much textbook material. Do I need to memorize every single protein pathway and cell cycle detail, or just the big picture?',
  'WRITING 39B':
    "e.g., Writing 39B (WR 50) requires so much reading. I'm struggling with the Rhetorical Analysis (RA) essay. What exactly are the instructors looking for in the rubric?",
  'WRITING 39C':
    'e.g., Writing 39C (WR 60) HCP and AP essays seem impossible. How do I find good peer-reviewed sources without spending 20 hours digging through the library databases?',
  'ECON 20A':
    'e.g., Taking Microeconomics (Econ 20A). The supply/demand shift graphs are confusing me. Does anyone have a good strategy for multiple-choice questions on the midterms?',
}

export const SENIOR_PLACEHOLDERS: Record<string, string> = {
  'ICS 31':
    "e.g., I know Zybooks can feel tedious, but don't skip the participation activities! I have a solid cheat sheet for string formatting and list slicing that saved me on the midterm...",
  'ICS 32':
    "e.g., The jump from 31 is real. I spent 10 hours just trying to get Git and my virtual environment working for Project 1. I made a step-by-step dummy guide for setting up PyCharm and handling API requests so you don't lose your mind...",
  'ICS 33':
    'e.g., Survived Pattis! Honestly, reading his 50-page notes is mandatory, not optional. I can show you how to write test cases effectively before coding the massive projects, and explain generators in plain English...',
  'ICS 45C':
    "e.g., C++ will humble you if you're coming from Python. Segfaults are brutal. I have a 1-pager on exactly how to read Valgrind errors and a visual guide to pointers vs. references that got me through Thornton's projects...",
  'ICS 46':
    'e.g., Honestly, the graph and maze projects almost broke me. My biggest piece of advice is to literally draw the AVL tree rotations on a whiteboard. I can share my study guide for the Big-O proofs and hash table collisions...',
  'ICS 51':
    "e.g., Everyone bombs the first x86 assembly midterm, it's basically a rite of passage. I figured out a really mechanical way to trace registers and calculate cache hits/misses that makes the final way less intimidating...",
  'MATH 3A':
    "e.g., The first few weeks of row reduction trick you into thinking it's an easy A, then you hit vector spaces and proofs. I can help explain eigenvalues geometrically rather than just giving you the formulas to memorize...",
  'MATH 2B':
    'e.g., The legendary UCI weed-out class... I clutched the common final. I have a giant flowchart for knowing exactly which integration technique to use, and a cheat sheet for Taylor Series convergence tests...',
  'COMPSCI 161':
    'e.g., CS 161 is pure logic. I have a GitHub repo of practice problems specifically for Dynamic Programming and a foolproof way to solve recurrence relations...',
  'COMPSCI 122A':
    "e.g., I mastered Carey's 122A! I can share my translation guide from SQL to Relational Algebra and tips on how to structure your E-R diagrams perfectly...",
  'ICS 53':
    'e.g., ICS 53 is a beast. I have a step-by-step guide on how to actually debug the multi-threading and socket programming projects without crashing the server...',
  'STATS 67':
    'e.g., Stats 67 is super useful for SWE interviews. I have a cheat sheet comparing all the distributions (Poisson, Binomial, Normal) so you know exactly when to use which...',
  'MATH 2A':
    'e.g., I have the ultimate Math 2A survival guide. I can share past common finals and break down exactly how to approach the optimization and limits problems...',
  'PHYSICS 7C':
    'e.g., Physics 7C is all about free body diagrams. I can show you the exact step-by-step mechanical method to break down any force, friction, or torque problem...',
  'CHEM 1A':
    'e.g., Survived Gen Chem! I have a whole folder of practice midterms and a strategy for getting through the ALEKS modules efficiently without losing sleep...',
  'CHEM 51A':
    "e.g., O-Chem isn't about memorization, it's about patterns! I have the perfect flashcard setup for functional groups and electron-pushing arrows...",
  'BIO SCI 93':
    "e.g., I aced Bio 93! Don't read the textbook word-for-word. I can share my Anki decks for the cell cycle and genetics that cover 90% of the midterm questions...",
  'WRITING 39B':
    'e.g., Writing 39B is all about writing to the rubric. I can share my A-grade Rhetorical Analysis essay and show you how to structure a bulletproof thesis statement...',
  'WRITING 39C':
    "e.g., I mastered the Writing 39C research process. I have a complete guide on how to abuse UCI Library's Advanced Search and synthesize sources quickly...",
  'ECON 20A':
    'e.g., I can help you ace Econ 20A. I have a summary sheet that explains every market structure (Monopoly, Oligopoly, etc.) and how deadweight loss shifts...',
}

export const STUDENT_COMBO_PLACEHOLDERS: Record<string, string> = {
  'ICS 31|MATH 2B':
    "e.g., I'm taking ICS 31 and MATH 2B together. I've heard Math 2B takes up a ton of time with WebWork and the common final. How should I balance studying for integrals while keeping up with Python labs?",
  'ICS 32|MATH 2B':
    "e.g., ICS 32 and MATH 2B in the same quarter... I know Thornton's projects are massive and 2B is the ultimate weed-out. Any tips on time management so I don't burn out by Week 5?",
  'ICS 46|ICS 51':
    'e.g., Taking ICS 46 and ICS 51 together. Balancing C++ data structures and Assembly language sounds like a nightmare. How do I context-switch between high-level and hardware-level coding without mixing them up?',
  'ICS 33|ICS 45C|MATH 3A':
    "e.g., Planning to take ICS 33, 45C, and MATH 3A simultaneously. Is this academic suicide? How do I manage Pattis's heavy projects, C++ memory leaks, and linear algebra all at once without dropping my GPA?",
}

export const SENIOR_COMBO_PLACEHOLDERS: Record<string, string> = {
  'ICS 31|MATH 2B':
    'e.g., I survived the ICS 31 + Math 2B combo! My best advice is to front-load the Python labs on weekends so you can dedicate weeknights strictly to Math 2B practice problems...',
  'ICS 32|MATH 2B':
    "e.g., Balancing ICS 32 and Math 2B is brutal but doable. I have a Notion template for scheduling Thornton's projects around 2B midterm weeks. I can show you how to prioritize...",
  'ICS 46|ICS 51':
    "e.g., The 46 + 51 gauntlet! I can show you how to structure your week so you aren't doing Assembly and C++ on the same day. I have solid study guides for both...",
  'ICS 33|ICS 45C|MATH 3A':
    'e.g., I took a crazy heavy course load like this before. The secret is starting projects the day they drop. I can share my calendar blocking strategy and how to study efficiently for Math 3A matrices...',
}

function joinCourseNames(checked: string[]): string {
  return checked.length === 2
    ? checked.join(' and ')
    : `${checked.slice(0, -1).join(', ')}, and ${checked[checked.length - 1]}`
}

export function getUserQueryPlaceholder(role: Role, checked: string[]): string {
  const comboKey = [...checked].sort().join('|')

  if (role === 'senior') {
    if (checked.length === 0) {
      return 'Drop a 1-sentence teaser tip here to witness the power of our AI model — then share your full story in the official Contributor Form below 👇'
    }
    if (checked.length === 1) {
      return (
        SENIOR_PLACEHOLDERS[checked[0]] ??
        `Drop a quick teaser about ${checked[0]} to witness the power of our AI model — then share the full story in the Contributor Form below 👇`
      )
    }
    return (
      SENIOR_COMBO_PLACEHOLDERS[comboKey] ??
      `Drop a quick teaser about surviving ${joinCourseNames(checked)} to witness the power of our AI model — then share the full strategies in the Contributor Form below 👇`
    )
  }

  if (checked.length === 0) {
    return "e.g., I just finished ICS 31 with a B+. I'm nervous about IDE setup and don't know where to start..."
  }
  if (checked.length === 1) {
    return (
      STUDENT_PLACEHOLDERS[checked[0]] ??
      `e.g., I'm preparing for ${checked[0]}, what specific concepts should I review first?`
    )
  }
  return (
    STUDENT_COMBO_PLACEHOLDERS[comboKey] ??
    `e.g., I'm planning to take ${joinCourseNames(checked)} simultaneously this quarter. How should I schedule my week to balance the heavy project workload with the math midterms?`
  )
}
