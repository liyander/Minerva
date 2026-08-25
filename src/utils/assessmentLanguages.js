export const ASSESSMENT_LANGUAGES = [
  { id: 'javascript', label: 'JavaScript', extension: 'js', runnable: true },
  { id: 'python', label: 'Python', extension: 'py', runnable: true },
  { id: 'c', label: 'C', extension: 'c', runnable: false },
  { id: 'cpp', label: 'C++', extension: 'cpp', runnable: false },
  { id: 'java', label: 'Java', extension: 'java', runnable: false },
]

const STARTER_CODE = {
  javascript: `function solve(input) {
  // Return the answer for the supplied input.
  return input
}
`,
  python: `def solve(input):
    # Return the answer for the supplied input.
    return input
`,
  c: `#include <stdio.h>

int main(void) {
    // Read from stdin and print the answer to stdout.
    return 0;
}
`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    // Read from stdin and print the answer to stdout.
    return 0;
}
`,
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner input = new Scanner(System.in);
        // Read from stdin and print the answer to stdout.
    }
}
`,
}

export function getAssessmentLanguage(language) {
  return ASSESSMENT_LANGUAGES.find((item) => item.id === language) || ASSESSMENT_LANGUAGES[0]
}

export function getStarterCode(language) {
  return STARTER_CODE[language] || STARTER_CODE.javascript
}

export function getQuestionStarterCode(question, language) {
  const languageCode = question?.settings?.starterCodes?.[language]
  if (typeof languageCode === 'string' && languageCode.trim()) return languageCode
  if (language === 'javascript' && question?.starterCode?.trim()) return question.starterCode
  return getStarterCode(language)
}

export function getQuestionSolutionCode(question, language) {
  const languageCode = question?.settings?.solutionCodes?.[language]
  if (typeof languageCode === 'string') return languageCode
  return language === 'javascript' ? String(question?.solutionCode || '') : ''
}
