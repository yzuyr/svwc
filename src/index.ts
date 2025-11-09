import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { mount } from "svelte";
import * as compiler from "svelte/compiler";

@customElement("svelte-component")
export class SvelteComponentElement extends LitElement {
  @property({ type: String })
  name?: string;

  override async connectedCallback() {
    super.connectedCallback();

    if (!this.name) {
      console.error("svelte-component requires a 'name' attribute");
      return;
    }

    // Extract script and template content
    const scriptElement = this.querySelector("script[lang='ts'], script");
    const scriptContent = scriptElement?.textContent || "";

    // Get all non-script children as template
    const templateNodes = Array.from(this.childNodes).filter(
      (node) => node.nodeName !== "SCRIPT"
    );

    const tempContainer = document.createElement("div");
    templateNodes.forEach((node) =>
      tempContainer.appendChild(node.cloneNode(true))
    );
    const templateContent = tempContainer.innerHTML;

    // Build full Svelte component source
    const svelteSource = `
<script lang="ts">
${scriptContent}
</script>

${templateContent}
`;

    // Compile the Svelte component
    const compiled = compiler.compile(svelteSource, {
      generate: "client",
      dev: false,
    });

    // Create component from compiled code
    try {
      const ComponentClass = await this.createComponentClass(compiled.js.code);
      // Register as custom element
      this.registerCustomElement(this.name, ComponentClass);
    } catch (e) {
      console.error("Failed to create component:", e);
      console.error("Compiled code was:", compiled.js.code);
      return;
    }

    // Clear original content
    this.innerHTML = "";
  }

  private async createComponentClass(compiledCode: string) {
    // Import all Svelte modules that might be needed
    const svelteInternals = await import("svelte/internal/client" as any);
    const svelteVersion = await import(
      "svelte/internal/disclose-version" as any
    );
    const svelte = await import("svelte");

    // Parse import statements and create a map of imported names
    const imports: Record<string, any> = {};
    const externalImports: Array<{ names: string[]; from: string }> = [];

    for (const line of compiledCode.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("import ")) {
        // Parse: import { x, y } from "svelte"
        const svelteMatch = trimmed.match(
          /import\s+\{([^}]+)\}\s+from\s+["']svelte["']/
        );
        if (svelteMatch) {
          const names = svelteMatch[1]?.split(",").map((n) => n.trim()) ?? [];
          names.forEach((name) => {
            imports[name] = (svelte as any)[name];
          });
        } else {
          // Parse other imports: import { x } from "package"
          const externalMatch = trimmed.match(
            /import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/
          );
          if (externalMatch && externalMatch[1] && externalMatch[2]) {
            const names = externalMatch[1].split(",").map((n) => n.trim());
            externalImports.push({ names, from: externalMatch[2] });
          }
        }
      }
    }

    // Dynamically import external packages
    for (const ext of externalImports) {
      try {
        const module = await import(ext.from);
        ext.names.forEach((name) => {
          imports[name] = module[name] ?? module.default;
        });
      } catch (e) {
        console.error(`Failed to import ${ext.from}:`, e);
      }
    }

    // Remove all import statements
    let rewrittenCode = compiledCode
      .split("\n")
      .filter((line) => !line.trim().startsWith("import "))
      .join("\n");

    // Replace export default function with const assignment
    rewrittenCode = rewrittenCode.replace(
      /export default function (\w+)/,
      "const Component = function $1"
    );

    // Replace $ references with svelteInternals.$
    rewrittenCode = rewrittenCode.replace(/\$\./g, "svelteInternals.");
    rewrittenCode = rewrittenCode.replace(
      /_unknown_\[svelteInternals\.FILENAME\]/g,
      "_unknown_[svelteInternals.FILENAME]"
    );

    // Wrap everything in a function that returns the component
    const wrappedCode = `
      return (function(svelteInternals, svelteVersion, imports) {
        const _unknown_ = {};
        // Destructure imports into scope
        ${Object.keys(imports)
          .map((name) => `const ${name} = imports.${name};`)
          .join("\n        ")}
        ${rewrittenCode}
        return Component;
      })(arguments[0], arguments[1], arguments[2]);
    `;

    const fn = new Function(wrappedCode);
    return fn(svelteInternals, svelteVersion, imports);
  }

  private registerCustomElement(name: string, ComponentClass: any) {
    if (customElements.get(name)) {
      console.warn(`Custom element '${name}' is already registered`);
      return;
    }

    class DynamicElement extends HTMLElement {
      private instance: any = null;

      static get observedAttributes() {
        // Observe all attributes by returning a list
        // In practice, you might want to be more specific
        return [];
      }

      connectedCallback() {
        // Collect all attributes as props
        const props: Record<string, any> = {};
        for (let i = 0; i < this.attributes.length; i++) {
          const attr = this.attributes[i];
          if (attr) {
            props[attr.name] = attr.value;
          }
        }

        this.instance = mount(ComponentClass, {
          target: this,
          props,
        });
      }

      disconnectedCallback() {
        if (this.instance) {
          this.instance.$destroy?.();
        }
      }

      attributeChangedCallback(
        name: string,
        oldValue: string,
        newValue: string
      ) {
        if (this.instance && oldValue !== newValue) {
          // Update prop if instance exists
          this.instance[name] = newValue;
        }
      }
    }

    customElements.define(name, DynamicElement);
  }

  override render() {
    return html`<slot></slot>`;
  }
}
