import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  // Check for active subscriptions using GraphQL query
  try {
    const response = await admin.graphql(
      `#graphql
      query GetActiveAppSubscriptions {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
          }
        }
      }`
    );

    const data = await response.json();
    console.log('[SERVER] Active subscriptions query response:', JSON.stringify(data, null, 2));
    
    const activeSubscriptions = data.data?.currentAppInstallation?.activeSubscriptions || [];
    const isActive = activeSubscriptions.length > 0 && 
                     activeSubscriptions.some(sub => sub.status === "ACTIVE" || sub.status === "ACCEPTED");
    
    
    // Update shop metafield with subscription status
    try {
      // First get shop ID
      const shopQuery = await admin.graphql(
        `#graphql
        query {
          shop {
            id
          }
        }`
      );
      const shopData = await shopQuery.json();
      const shopId = shopData.data?.shop?.id;
      
      if (shopId) {
        await admin.graphql(
          `#graphql
          mutation SetShopMetafield($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields {
                id
                namespace
                key
                value
              }
              userErrors {
                field
                message
              }
            }
          }`,
          {
            variables: {
              metafields: [
                {
                  namespace: "agreed_app",
                  key: "subscription_active",
                  value: String(isActive),
                  type: "boolean",
                  ownerId: shopId
                }
              ]
            }
          }
        );
        console.log('[SERVER] Shop metafield updated:', { isActive, shopId });
      }
    } catch (metafieldError) {
      console.error('[SERVER] Error updating shop metafield:', metafieldError);
      // Continue even if metafield update fails
    }
    
    return {
      shopDomain: session.shop,
      isActive,
      activeSubscriptions,
    };
  } catch (error) {
    console.error('[SERVER] Error checking active subscriptions:', error);
    return {
      shopDomain: session.shop,
      isActive: false,
      activeSubscriptions: [],
    };
  }
};


export default function Index() {
  const { shopDomain, isActive } = useLoaderData();
  const shopify = useAppBridge();

  // Log initial state on client
  useEffect(() => {
    console.log('[CLIENT] Component mounted with initial state:', {
      shopDomain,
      isActive
    });
  }, []); // Only run on mount

  // Redirect to pricing plans if not active
  useEffect(() => {
    if (!isActive) {
      const pricingUrl = `https://${shopDomain}/admin/charges/agree-2/pricing_plans`;
      console.log('[CLIENT] Plan not active, redirecting to:', pricingUrl);
      if (window.top) {
        window.top.location.href = pricingUrl;
      } else {
        window.location.href = pricingUrl;
      }
    }
  }, [isActive, shopDomain]);

  const [extensionStatus, setExtensionStatus] = useState({
    label: "Checking status…",
    tone: "subdued",
    helper: "Looking up the checkout checkbox extension for this shop.",
  });
  const [statusError, setStatusError] = useState("");
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isOpeningSettings, setIsOpeningSettings] = useState(false);
  const [hasRequestedReview, setHasRequestedReview] = useState(false);

  const checkExtensionStatus = useCallback(async () => {
    if (!shopify) return;
    setIsCheckingStatus(true);
    setStatusError("");
    try {
      const extensions = await shopify.app.extensions();
      const checkboxExtension = extensions.find(ext => ext.handle === "checkout-checkbox");
      if (!checkboxExtension) {
        setExtensionStatus({
          label: "Not found",
          tone: "critical",
          helper: "No checkout checkbox extension found. Make sure it's deployed and targets 'purchase.checkout.block.render'.",
        });
        return;
      }
      const activationCount = checkboxExtension?.activations?.length || 0;
      const isActive = activationCount > 0;
      setExtensionStatus({
        label: isActive ? "Active" : "Inactive",
        tone: isActive ? "success" : "info",
        helper: isActive
          ? "Extension is active. The checkbox is now appearing in your checkout."
          : "Extension is deployed but inactive. Check if it targets 'purchase.checkout.block.render'.",
      });
      if (isActive && !hasRequestedReview) {
        requestReview();
      }
    } catch (error) {
      console.error("Failed to load extension status", error);
      setStatusError("Unable to verify the checkbox extension status. Please try refreshing the page.");
      setExtensionStatus({
        label: "Error",
        tone: "critical",
        helper: null,
      });
    } finally {
      setIsCheckingStatus(false);
    }
  }, [shopify, hasRequestedReview]);

  const requestReview = useCallback(async () => {
    if (!shopify || hasRequestedReview) return;
    try {
      const result = await shopify.reviews.request();
      if (result.success) {
        setHasRequestedReview(true);
      }
    } catch (error) {
      console.error('Error requesting review:', error);
    }
  }, [shopify, hasRequestedReview]);

  useEffect(() => {
    if (isActive) {
      checkExtensionStatus();
    }
  }, [checkExtensionStatus, isActive]);

  const checkoutSettingsUrl = useMemo(() => {
    if (!shopDomain) return null;
    return `https://${shopDomain}/admin/settings/checkout/editor/?page=information&context=apps`;
  }, [shopDomain]);

  const handleManageSettings = useCallback(() => {
    if (!checkoutSettingsUrl) return;
    setIsOpeningSettings(true);
    setTimeout(() => {
      setIsOpeningSettings(false);
      checkExtensionStatus();
    }, 20000);
    window.open(checkoutSettingsUrl, "_blank");
  }, [checkoutSettingsUrl, checkExtensionStatus]);
  if (!isActive) {
    return <s-spinner accessibilityLabel="Loading" size="large-100" />;
  }
  // Show main app interface if active
  return (
    <div suppressHydrationWarning>
      <s-page heading="AGREED - Checkout Checkbox Extension">
        {checkoutSettingsUrl && (
          <s-button
          variant="primary"
          slot="primary-action"
          href={checkoutSettingsUrl}
          target="_blank"
          loading={isOpeningSettings}
          disabled={isOpeningSettings}
          suppressHydrationWarning
        >
          {isOpeningSettings ? "Opening settings…" : "Manage settings"}
        </s-button>
        )}

        <s-section heading="Extension status">
          <s-stack gap="base">
            <s-stack gap="tight" direction="inline" alignItems="center">
              <s-heading size="base">Status:</s-heading>
              <s-badge tone={extensionStatus.tone || "subdued"}>
                {extensionStatus.label}
              </s-badge>
            </s-stack>

            {extensionStatus.helper && (
              <s-text appearance="subdued">{extensionStatus.helper}</s-text>
            )}

            {!extensionStatus.helper && extensionStatus.label === "Inactive" && (
              <s-text appearance="subdued">
                Extension is currently inactive. Please configure and publish it in the <a href={checkoutSettingsUrl} target="_blank">checkout editor</a> to enable functionality.
              </s-text>
            )}

            {statusError && (
              <s-banner tone="critical" heading="Error">
                {statusError}
              </s-banner>
            )}

            <s-button
              onClick={checkExtensionStatus}
              loading={isCheckingStatus}
              disabled={isCheckingStatus}
              suppressHydrationWarning
            >
              Refresh status
            </s-button>
          </s-stack>
        </s-section>

        <s-section heading="How to use this app">
          <s-stack gap="base">
            <s-unordered-list>
              <s-list-item>
                Review the status badge above to confirm whether the checkout
                checkbox extension is active.
              </s-list-item>
              <s-list-item>
                Click <s-text emphasis="bold">Manage settings</s-text> to open the
                checkout editor and adjust the checkbox configuration.
              </s-list-item>
              <s-list-item>
                Update the checkbox label, required state, and product/country
                targeting directly in the settings panel.
              </s-list-item>
              <s-list-item>
                After making changes, publish your checkout in the editor.
              </s-list-item>
              <s-list-item>
                Return to this page and click{" "}
                <s-text emphasis="bold">Refresh status</s-text> to verify the
                extension is active.
              </s-list-item>
              <s-list-item>
                Test the checkout flow to ensure the checkbox appears and blocks
                progress when required.
              </s-list-item>
            </s-unordered-list>
          </s-stack>
        </s-section>
      </s-page>
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};