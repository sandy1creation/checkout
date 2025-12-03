import '@shopify/ui-extensions/preact';
import {render} from "preact";
import {useState, useEffect} from "preact/hooks";
import {useBuyerJourneyIntercept} from '@shopify/ui-extensions/checkout/preact';

export default async () => {
  render(<Extension />, document.body)
};

function Extension() {
  const settings = shopify.settings.value || {};
  
  const extractTextFromRichText = (richTextObj) => {
    if (typeof richTextObj === 'string') return richTextObj;
    if (!richTextObj || typeof richTextObj !== 'object') return '';
    
    const extractFromNode = (node) => {
      if (!node) return '';
      if (typeof node === 'string') return node;
      if (typeof node !== 'object') return '';
      
      if (node.type === 'text') return node.value || node.text || '';
      if (node.type === 'root' && node.children) return extractFromChildren(node.children);
      if (node.children && Array.isArray(node.children)) return extractFromChildren(node.children);
      
      return '';
    };
    
    const extractFromChildren = (children) => {
      if (!Array.isArray(children)) return '';
      return children.map(child => extractFromNode(child)).join('');
    };
    
    return extractFromNode(richTextObj);
  };
  
  const getStringSetting = (key, defaultValue = '') => {
    const value = settings[key];
    if (value === null || value === undefined) return defaultValue;
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      const extracted = extractTextFromRichText(value);
      return extracted && extracted.trim() !== '' ? extracted : defaultValue;
    }
    return String(value);
  };
  
  const getBooleanSetting = (key, defaultValue = false) => {
    const value = settings[key];
    return typeof value === 'boolean' ? value : defaultValue;
  };
  
  // Hide checkbox setting
  const hideCheckbox = getBooleanSetting('hide_checkbox', false);
  const defaultChecked = getBooleanSetting('checkbox_default_checked', false);
  const [isChecked, setIsChecked] = useState(defaultChecked);
  const checkboxRequired = getBooleanSetting('checkbox_required', false);
  const blockErrorMessage = getStringSetting('block_error_message', 'Please accept the terms to continue');
  const [showError, setShowError] = useState(false);
  
  // Multiple variants setting
  const variantSelection = getStringSetting('variant_selection', '');
  const matchAnyVariant = getBooleanSetting('match_any_variant', true);
  
  // UPDATED: Parse rich text with bold and italic support
  const parseRichTextLabel = (richTextObj) => {
    if (!richTextObj || typeof richTextObj !== 'object') {
      return typeof richTextObj === 'string' ? [richTextObj] : ['I agree to the terms and conditions'];
    }
    
    let nodeIndex = 0;
    
    const convertNode = (node, keyPrefix = '') => {
      if (!node) return null;
      if (typeof node === 'string') return node;
      if (typeof node !== 'object') return String(node);
      
      // Text node - return the text value
      if (node.type === 'text') {
        return node.value || node.text || '';
      }
      
      // NEW: Bold text
      if (node.type === 'bold') {
        const boldContent = node.children && Array.isArray(node.children)
          ? node.children.map((child, i) => convertNode(child, `${keyPrefix}-bold-${i}`)).filter(Boolean)
          : [node.value || node.text || ''];
        
        const boldKey = `bold-${keyPrefix}-${nodeIndex++}`;
        
        return (
          <s-text key={boldKey} emphasis="bold">
            {boldContent}
          </s-text>
        );
      }
      
      // NEW: Italic text
      if (node.type === 'italic') {
        const italicContent = node.children && Array.isArray(node.children)
          ? node.children.map((child, i) => convertNode(child, `${keyPrefix}-italic-${i}`)).filter(Boolean)
          : [node.value || node.text || ''];
        
        const italicKey = `italic-${keyPrefix}-${nodeIndex++}`;
        
        return (
          <s-text key={italicKey} emphasis="italic">
            {italicContent}
          </s-text>
        );
      }
      
      // Link node - convert to s-link component
      if (node.type === 'link') {
        const linkText = node.children && Array.isArray(node.children)
          ? node.children.map((child, i) => convertNode(child, `${keyPrefix}-link-child-${i}`)).filter(Boolean).join('')
          : (node.value || node.text || node.url || '');
        
        const linkKey = `link-${keyPrefix}-${nodeIndex++}`;
        
        // Handle external links properly
        const isExternal = node.url?.startsWith('http');
        
        return (
          <s-link
            key={linkKey}
            href={node.url || '#'}
            target={isExternal ? '_blank' : '_self'}
          >
            {linkText || node.url || 'link'}
          </s-link>
        );
      }
      
      // Root or paragraph node - process children
      if (node.children && Array.isArray(node.children)) {
        return node.children.map((child, i) => convertNode(child, `${keyPrefix}-${i}`)).filter(Boolean);
      }
      
      return null;
    };
    
    const result = convertNode(richTextObj, 'label');
    
    // Flatten nested arrays
    const flatten = (arr) => {
      if (!Array.isArray(arr)) return [arr];
      return arr.reduce((acc, item) => {
        if (item === null || item === undefined || item === '') return acc;
        if (Array.isArray(item)) return acc.concat(flatten(item));
        return acc.concat(item);
      }, []);
    };
    
    const flattened = flatten(result).filter(item => item !== null && item !== undefined && item !== '');
    console.log('Parsed rich text label elements:', flattened);
    return flattened.length > 0 ? flattened : ['I agree to the terms and conditions'];
  };
  
  const [cartLines, setCartLines] = useState([]);
  const [countryCode, setCountryCode] = useState('');
  
  useEffect(() => {
    try {
      if (shopify.shippingAddress?.value?.countryCode) {
        setCountryCode(shopify.shippingAddress.value.countryCode);
      }
      
      if (shopify.shippingAddress?.subscribe) {
        const unsubscribe = shopify.shippingAddress.subscribe((address) => {
          if (address?.countryCode) setCountryCode(address.countryCode);
        });
        return unsubscribe;
      }
    } catch (e) {
      console.log('Cart or shipping address APIs not available:', e);
    }
  }, []);
  
  // Return null if checkbox should be hidden
  if (hideCheckbox) {
    return null;
  }
  
  if (!shopify.instructions.value.attributes.canUpdateAttributes) {
    return (
      <s-banner heading="checkout-ui" tone="warning">
        {shopify.i18n.translate("attributeChangesAreNotSupported")}
      </s-banner>
    );
  }

  const shouldShowCheckbox = () => {
    const countrySelection = getStringSetting('country_selection', '');
    
    let variantMatch = true;
    let countryMatch = true;
    
    // Multiple variant matching logic
    if (variantSelection) {
      const selectedVariants = variantSelection.split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0);
      
      if (selectedVariants.length > 0) {
        const cartVariantIds = cartLines.map(line => {
          return line?.merchandise?.id || 
                 line?.merchandise?.variant?.id || 
                 line?.variant?.id || 
                 '';
        }).filter(id => id);
        
        if (matchAnyVariant) {
          // Show if ANY selected variant is in cart
          variantMatch = selectedVariants.some(selectedVariant => 
            cartVariantIds.some(cartVariantId => {
              return cartVariantId === selectedVariant || 
                     cartVariantId.includes(selectedVariant) ||
                     selectedVariant.includes(cartVariantId);
            })
          );
        } else {
          // Show only if ALL selected variants are in cart
          variantMatch = selectedVariants.every(selectedVariant => 
            cartVariantIds.some(cartVariantId => {
              return cartVariantId === selectedVariant || 
                     cartVariantId.includes(selectedVariant) ||
                     selectedVariant.includes(cartVariantId);
            })
          );
        }
      }
    }
    
    if (countrySelection && countryCode) {
      const selectedCountries = countrySelection.split(',')
        .map(c => c.trim().toUpperCase())
        .filter(c => c);
      countryMatch = selectedCountries.length === 0 || 
                     selectedCountries.includes(countryCode.toUpperCase());
    }
    
    return variantMatch && countryMatch;
  };

  const shouldShow = shouldShowCheckbox();
  
  // Buyer Journey Intercept - Block checkout if checkbox is required but not checked
  useBuyerJourneyIntercept(
    ({canBlockProgress}) => {
      if (!shouldShow) {
        return { behavior: 'allow' };
      }
      
      return canBlockProgress && checkboxRequired && !isChecked
        ? {
            behavior: 'block',
            reason: 'Checkbox not checked',
            errors: [
              {
                // Show error at page level
                message: blockErrorMessage,
              },
            ],
            perform: (result) => {
              if (result.behavior === 'block') {
                setShowError(true);
              }
            },
          }
        : {
            behavior: 'allow',
            perform: () => {
              setShowError(false);
            },
          };
    },
  );
  
  if (!shouldShow) {
    return null;
  }

  const rawCheckboxLabel = settings.checkbox_label;
  console.log('Raw checkbox label:', rawCheckboxLabel);
  
  const parsedLabelElements = parseRichTextLabel(rawCheckboxLabel);
  console.log('Parsed label elements:', parsedLabelElements);

  const handleCheckboxChange = (event) => {
    let checked = false;
    if (event) {
      if ('checked' in event && typeof event.checked === 'boolean') {
        checked = event.checked;
      } else if ('target' in event && event.target) {
        const target = event.target;
        if ('checked' in target && typeof target.checked === 'boolean') {
          checked = target.checked;
        }
      }
    }
    setIsChecked(checked);
  };

  return (
    <s-stack gap="base">
      <s-stack gap="base" direction="inline">
        <s-checkbox
          id="conditional-checkbox"
          checked={isChecked}
          defaultChecked={defaultChecked}
          required={checkboxRequired}
          onChange={handleCheckboxChange}
          error={showError ? blockErrorMessage : null}
        />
        <s-text>
          {parsedLabelElements}
        </s-text>
      </s-stack>
    </s-stack>
  );
}