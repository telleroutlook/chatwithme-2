import { describe, it, expect } from "vitest";
import {
  sanitizeMermaidCode,
  validateDeclaration,
  validateBrackets,
  validateNoHtml,
  validateNoMarkdownSyntax,
  validateMermaidCode,
} from "./mermaidValidator";

describe("validateDeclaration", () => {
  it("should accept valid flowchart declaration", () => {
    const result = validateDeclaration("flowchart TD\n A --> B");
    expect(result.valid).toBe(true);
  });

  it("should accept valid graph declaration with direction", () => {
    const result = validateDeclaration("graph TD\n A --> B");
    expect(result.valid).toBe(true);
  });

  it("should accept valid sequenceDiagram declaration", () => {
    const result = validateDeclaration("sequenceDiagram\n A->>B: Hello");
    expect(result.valid).toBe(true);
  });

  it("should accept valid pie declaration", () => {
    const result = validateDeclaration("pie title Test\n A: 50");
    expect(result.valid).toBe(true);
  });

  it("should accept valid stateDiagram-v2 declaration", () => {
    const result = validateDeclaration("stateDiagram-v2\n [*] --> A");
    expect(result.valid).toBe(true);
  });

  it("should accept valid erDiagram declaration", () => {
    const result = validateDeclaration("erDiagram\n USER ||--o{ ORDER : places");
    expect(result.valid).toBe(true);
  });

  it("should accept valid gantt declaration", () => {
    const result = validateDeclaration("gantt\n title Schedule\n dateFormat YYYY-MM-DD");
    expect(result.valid).toBe(true);
  });

  it("should accept valid classDiagram declaration", () => {
    const result = validateDeclaration("classDiagram\n class Animal { +String name }");
    expect(result.valid).toBe(true);
  });

  it("should accept valid timeline declaration", () => {
    const result = validateDeclaration("timeline\n title History\n 2001 : Event");
    expect(result.valid).toBe(true);
  });

  it("should accept valid mindmap declaration", () => {
    const result = validateDeclaration("mindmap\n root((Topic))\n  Item1");
    expect(result.valid).toBe(true);
  });

  it("should reject unknown diagram type", () => {
    const result = validateDeclaration("unknownType\n A --> B");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("declaration");
    expect(result.error).toContain("unknownType");
  });

  it("should reject empty code", () => {
    const result = validateDeclaration("");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("empty");
  });

  it("should reject whitespace-only code", () => {
    const result = validateDeclaration("   \n   ");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("empty");
  });

  it("should reject code without declaration", () => {
    const result = validateDeclaration("A --> B\n B --> C");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("declaration");
  });
});

describe("validateBrackets", () => {
  it("should accept balanced brackets", () => {
    const result = validateBrackets("flowchart TD\n A[Start] --> B{End}");
    expect(result.valid).toBe(true);
  });

  it("should accept nested balanced brackets", () => {
    const result = validateBrackets("flowchart TD\n A[[Nested]] --> B({Curved})");
    expect(result.valid).toBe(true);
  });

  it("should reject unmatched opening bracket", () => {
    const result = validateBrackets("flowchart TD\n A[Start --> B");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("brackets");
    expect(result.error).toContain("Unclosed");
  });

  it("should reject unmatched closing bracket", () => {
    const result = validateBrackets("flowchart TD\n A]Start] --> B");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("brackets");
    expect(result.error).toContain("Unmatched");
  });

  it("should handle brackets in strings", () => {
    const result = validateBrackets('pie title "Test (Chart)"\n A: 50');
    expect(result.valid).toBe(true);
  });

  it("should handle single quotes in strings", () => {
    const result = validateBrackets("flowchart TD\n A['Text (with parens)'] --> B");
    expect(result.valid).toBe(true);
  });

  it("should accept code without brackets", () => {
    const result = validateBrackets("sequenceDiagram\n A->>B: Message");
    expect(result.valid).toBe(true);
  });
});

describe("validateNoHtml", () => {
  it("should accept code without HTML tags", () => {
    const result = validateNoHtml("flowchart TD\n A --> B");
    expect(result.valid).toBe(true);
  });

  it("should reject code with <br/> tag", () => {
    const result = validateNoHtml("flowchart TD\n A[Line 1<br/>Line 2]");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("html");
  });

  it("should reject code with <b> tag", () => {
    const result = validateNoHtml('flowchart TD\n A["<b>Bold</b> text"]');
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("html");
  });

  it("should reject code with <div> tag", () => {
    const result = validateNoHtml("flowchart TD\n A[<div>content</div>]");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("html");
  });

  it("should reject code with self-closing tag", () => {
    const result = validateNoHtml("flowchart TD\n A[Text <img src='x'/>]");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("html");
  });

  it("should accept code with angle brackets that are not HTML", () => {
    // Angle brackets in Mermaid syntax (comparison operators)
    const result = validateNoHtml("flowchart TD\n A --> B\n note: 1 < 2");
    expect(result.valid).toBe(true);
  });
});

describe("sanitizeMermaidCode", () => {
  it("should remove zero-width chars and normalize line endings", () => {
    const result = sanitizeMermaidCode("flowchart TD\r\n A\u200B --> B");
    expect(result.sanitized).toBe("flowchart TD\n A --> B");
    expect(result.changed).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);
  });

  it("should replace <br/> with spaces", () => {
    const result = sanitizeMermaidCode("flowchart TD\n A[Line1<br/>Line2] --> B");
    expect(result.sanitized).toContain("Line1 Line2");
  });
});

describe("validateNoMarkdownSyntax", () => {
  it("should reject markdown heading syntax", () => {
    const result = validateNoMarkdownSyntax("flowchart TD\n # heading");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("markdown");
  });

  it("should reject markdown list syntax", () => {
    const result = validateNoMarkdownSyntax("flowchart TD\n - item");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("markdown");
  });

  it("should reject markdown table syntax", () => {
    const result = validateNoMarkdownSyntax("flowchart TD\n | a | b |");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("markdown");
  });
});

describe("validateMermaidCode", () => {
  // Valid diagrams
  it("should accept valid flowchart", () => {
    const result = validateMermaidCode("flowchart TD\n A[Start] --> B{Decision}\n B -->|Yes| C[Action]");
    expect(result.valid).toBe(true);
  });

  it("should accept valid sequenceDiagram", () => {
    const result = validateMermaidCode(`
sequenceDiagram
    participant A as Client
    participant B as Server
    A->>B: Request
    B-->>A: Response
`);
    expect(result.valid).toBe(true);
  });

  it("should accept valid pie chart", () => {
    const result = validateMermaidCode('pie title Distribution\n "A": 40\n "B": 60');
    expect(result.valid).toBe(true);
  });

  it("should accept valid gantt chart", () => {
    const result = validateMermaidCode(`
gantt
    title Project Schedule
    dateFormat YYYY-MM-DD
    section Phase 1
        Task A: 2024-01-01, 7d
`);
    expect(result.valid).toBe(true);
  });

  it("should accept valid class diagram", () => {
    const result = validateMermaidCode(`
classDiagram
    class Animal {
        +String name
        +makeSound()
    }
    class Dog {
        +bark()
    }
    Animal <|-- Dog
`);
    expect(result.valid).toBe(true);
  });

  it("should accept valid erDiagram", () => {
    const result = validateMermaidCode(`
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
`);
    expect(result.valid).toBe(true);
  });

  it("should accept valid timeline", () => {
    const result = validateMermaidCode(`
timeline
    title Project History
    2023-01 : Started
    2023-06 : Beta
    2024-01 : Launch
`);
    expect(result.valid).toBe(true);
  });

  it("should accept valid mindmap", () => {
    const result = validateMermaidCode(`
mindmap
    root((Project))
        Planning
        Development
        Testing
`);
    expect(result.valid).toBe(true);
  });

  // Invalid cases
  it("should reject empty code", () => {
    const result = validateMermaidCode("");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("empty");
  });

  it("should reject whitespace-only code", () => {
    const result = validateMermaidCode("   \n\t  ");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("empty");
  });

  it("should reject unknown diagram type", () => {
    const result = validateMermaidCode("invalidType\n A --> B");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("declaration");
  });

  it("should reject HTML tags", () => {
    const result = validateMermaidCode('flowchart TD\n A["Text<br/>More"]');
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("html");
  });

  it("should reject HTML bold tag", () => {
    const result = validateMermaidCode('pie title "Test"\n A: <b>50</b>');
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("html");
  });

  // Edge cases
  it("should handle flowchart with subgraphs", () => {
    const result = validateMermaidCode(`
flowchart TB
    subgraph one
        a1 --> a2
    end
    subgraph two
        b1 --> b2
    end
    one --> two
`);
    expect(result.valid).toBe(true);
  });

  it("should handle graph with direction", () => {
    const result = validateMermaidCode("graph LR\n A --> B --> C");
    expect(result.valid).toBe(true);
  });

  it("should handle flowchart with direction", () => {
    const result = validateMermaidCode("flowchart LR\n A --> B");
    expect(result.valid).toBe(true);
  });

  it("should return error message for invalid code", () => {
    const result = validateMermaidCode("invalidDiagram\n test");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });

  it("should reject markdown heading in mermaid block", () => {
    const result = validateMermaidCode("flowchart TD\n # Title");
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe("markdown");
  });
});
