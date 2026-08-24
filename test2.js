import { parseMarkdownToHtml } from './src/utils/markdown.js';
console.log(parseMarkdownToHtml('> ```html\n> <script>alert(window.origin)</script>\n> ```'));
console.log(parseMarkdownToHtml('```html\n<script>alert(window.origin)</script>\n```'));
console.log(parseMarkdownToHtml('  ```html\n  <script>alert(window.origin)</script>\n  ```'));
