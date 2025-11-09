# svwc

Create Svelte client-side Web Components without any bundler.

## Usage

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
  </head>
  <body>
    <svelte-component name="my-component" style="display: none">
      <script lang="ts" type="javascript/blocked">
        let { foo } = $props();
        let counter = $state(0);
        function increment() {
          counter += 1;
        }
      </script>
      <p>{foo}</p>
      <p>{counter}</p>
      <button onclick="{increment}">Increment</button>
    </svelte-component>
    <my-component foo="bar"></my-component>
    <script type="module" src="https://esm.sh/svwc"></script>
  </body>
</html>
```
