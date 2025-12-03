# Rich Text Field Settings in Shopify Checkout UI Extensions

## Overview

The `rich_text_field` is a setting type in Shopify Checkout UI Extensions that allows merchants to input formatted text with links, bold, italic, and other formatting options. This field uses Shopify's Lexical editor format to store structured content.

## Configuration

### Basic Syntax

```toml
[[extensions.settings.fields]]
key = "checkbox_label"
type = "rich_text_field"
name = "Checkbox Label"
description = "Visual content to use as the control label. Use Link to create links."
```

### Available Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `key` | string | Yes | Unique identifier for the setting (used to access in code) |
| `type` | string | Yes | Must be `"rich_text_field"` |
| `name` | string | Yes | Display name shown to merchants in the admin |
| `description` | string | No | Help text displayed below the field name |

### Additional Optional Properties

Currently, `rich_text_field` does not support additional configuration properties like:
- `default` - No default value support
- `validations` - No built-in validation
- `placeholder` - No placeholder text support

## Data Structure

### Format

The `rich_text_field` returns a **Lexical editor JSON object** with the following structure:

```javascript
{
  type: 'root',
  children: [
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: 'Hello '
        },
        {
          type: 'link',
          url: 'https://example.com',
          target: '_blank',
          children: [
            {
              type: 'text',
              value: 'am'
            }
          ]
        },
        {
          type: 'text',
          value: ' here'
        }
      ]
    }
  ]
}
```

### Node Types

1. **`root`** - Top-level container
   - Always has `type: 'root'`
   - Contains `children` array

2. **`paragraph`** - Text paragraph block
   - Contains `children` array with text and inline elements

3. **`text`** - Plain text node
   - `value` or `text` property contains the text content

4. **`link`** - Hyperlink node
   - `url` - The link URL
   - `target` - Link target (`'_blank'`, `'_self'`, or `'modal'`)
   - `children` - Array containing the link text (usually text nodes)

5. **Other possible types** (depending on editor features):
   - `heading` - Headings (h1, h2, etc.)
   - `list` - Ordered/unordered lists
   - `listitem` - List items
   - `linebreak` - Line breaks

## Accessing in Code

### In Your Extension Component

```javascript
const settings = shopify.settings.value || {};
const richTextValue = settings.checkbox_label;

// richTextValue will be the Lexical JSON object
console.log(richTextValue);
// Output: { type: 'root', children: [...] }
```

### Parsing Rich Text

You need to parse the Lexical structure to extract text and convert links to components:

```javascript
const parseRichTextLabel = (richTextObj) => {
  if (!richTextObj || typeof richTextObj !== 'object') {
    return ['Default text'];
  }
  
  const convertNode = (node) => {
    if (node.type === 'text') {
      return node.value || node.text || '';
    }
    
    if (node.type === 'link') {
      const linkText = node.children
        ? node.children.map(convertNode).join('')
        : node.url || 'link';
      
      return (
        <s-link href={node.url || '#'} target={node.target || 'auto'}>
          {linkText}
        </s-link>
      );
    }
    
    if (node.children && Array.isArray(node.children)) {
      return node.children.map(convertNode).filter(Boolean);
    }
    
    return null;
  };
  
  return convertNode(richTextObj);
};
```

## Limitations

### 1. **No HTML Support**
- Cannot use raw HTML tags
- Must use Shopify Polaris components (`<s-link>`, `<s-text>`, etc.)

### 2. **No Custom Styling**
- Cannot apply custom CSS classes
- Limited to Shopify's design system

### 3. **Link Configuration**
- Links are created in the Shopify admin editor
- Link URLs and targets are stored in the Lexical structure
- Cannot programmatically modify links from code

### 4. **No Conditional Formatting**
- Cannot conditionally show/hide parts of rich text
- All content is always rendered

### 5. **Settings Limit**
- Maximum of 25 interactive settings per extension block
- Each `rich_text_field` counts as one setting

## Best Practices

### 1. **Provide Clear Descriptions**

```toml
description = "Visual content to use as the control label. Use the Link button in the editor to create clickable links."
```

### 2. **Handle Missing/Empty Values**

```javascript
const getRichTextSetting = (key, defaultValue = '') => {
  const value = settings[key];
  if (!value || typeof value !== 'object') {
    return defaultValue;
  }
  // Parse and return
};
```

### 3. **Extract Plain Text Fallback**

```javascript
const extractPlainText = (richTextObj) => {
  if (typeof richTextObj === 'string') return richTextObj;
  if (!richTextObj || typeof richTextObj !== 'object') return '';
  
  const extract = (node) => {
    if (node.type === 'text') return node.value || node.text || '';
    if (node.children) return node.children.map(extract).join('');
    return '';
  };
  
  return extract(richTextObj);
};
```

### 4. **Flatten Nested Arrays**

When parsing, you may get nested arrays. Flatten them:

```javascript
const flatten = (arr) => {
  if (!Array.isArray(arr)) return [arr];
  return arr.reduce((acc, item) => {
    if (Array.isArray(item)) return acc.concat(flatten(item));
    return acc.concat(item);
  }, []);
};
```

## Example: Complete Implementation

```javascript
function Extension() {
  const settings = shopify.settings.value || {};
  const richTextLabel = settings.checkbox_label;
  
  const parseRichText = (richTextObj) => {
    if (!richTextObj || typeof richTextObj !== 'object') {
      return ['I agree to the terms'];
    }
    
    const convertNode = (node, keyPrefix = '') => {
      if (node.type === 'text') {
        return node.value || '';
      }
      
      if (node.type === 'link') {
        const linkText = node.children
          ? node.children.map((child, i) => 
              convertNode(child, `${keyPrefix}-${i}`)
            ).join('')
          : node.url || 'link';
        
        return (
          <s-link
            key={`link-${keyPrefix}`}
            href={node.url || '#'}
            target={node.target === '_blank' ? '_blank' : 'auto'}
          >
            {linkText}
          </s-link>
        );
      }
      
      if (node.children) {
        return node.children.map((child, i) => 
          convertNode(child, `${keyPrefix}-${i}`)
        );
      }
      
      return null;
    };
    
    const result = convertNode(richTextObj, 'label');
    
    // Flatten nested arrays
    const flatten = (arr) => {
      if (!Array.isArray(arr)) return [arr];
      return arr.reduce((acc, item) => {
        if (Array.isArray(item)) return acc.concat(flatten(item));
        return acc.concat(item);
      }, []);
    };
    
    return flatten(result).filter(Boolean);
  };
  
  const labelElements = parseRichText(richTextLabel);
  
  return (
    <s-stack gap="base" direction="inline">
      <s-checkbox id="terms-checkbox" />
      <s-text>
        {labelElements}
      </s-text>
    </s-stack>
  );
}
```

## Related Documentation

- [Shopify Checkout UI Extensions Configuration](https://shopify.dev/docs/api/checkout-ui-extensions/latest/configuration)
- [Settings Definition](https://shopify.dev/docs/api/checkout-ui-extensions/latest/configuration#settings-definition)
- [Polaris Web Components - Link](https://shopify.dev/docs/api/checkout-ui-extensions/latest/polaris-web-components/forms/link)
- [Polaris Web Components - Text](https://shopify.dev/docs/api/checkout-ui-extensions/latest/polaris-web-components/typography/text)

## Common Issues & Solutions

### Issue: `[object Object]` showing instead of text

**Solution:** You're trying to convert the rich text object directly to a string. Parse it first:

```javascript
// ❌ Wrong
const label = String(settings.checkbox_label);

// ✅ Correct
const label = extractPlainText(settings.checkbox_label);
```

### Issue: Links not rendering

**Solution:** Make sure you're converting link nodes to `<s-link>` components:

```javascript
if (node.type === 'link') {
  return (
    <s-link href={node.url} target={node.target || 'auto'}>
      {linkText}
    </s-link>
  );
}
```

### Issue: Nested arrays causing rendering errors

**Solution:** Flatten the array before rendering:

```javascript
const flattened = flatten(parsedElements).filter(Boolean);
```

## Summary

- `rich_text_field` stores content as Lexical JSON objects
- Must parse the structure to extract text and convert links to components
- No HTML support - use Shopify Polaris components
- Links are created in the admin editor, not programmatically
- Always provide fallback text for empty/missing values
- Flatten nested arrays before rendering

