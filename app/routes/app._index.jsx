import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shopDomain: session.shop };
};

export default function Index() {
  const { shopDomain } = useLoaderData();
  const shopify = useAppBridge();

  const [extensionStatus, setExtensionStatus] = useState({
    label: "Checking status…",
    tone: "subdued",
    helper: "Looking up the checkout checkbox extension for this shop.",
  });
  const [statusError, setStatusError] = useState("");
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isOpeningSettings, setIsOpeningSettings] = useState(false);

  const checkExtensionStatus = useCallback(async () => {
    if (!shopify) return;

    setIsCheckingStatus(true);
    setStatusError("");
    
    try {
      const extensions = await shopify.app.extensions();
      
      // Find the specific checkout-checkbox extension by handle
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
  }, [shopify]);

  useEffect(() => {
    checkExtensionStatus();
  }, [checkExtensionStatus]);

  const checkoutSettingsUrl = useMemo(() => {
    if (!shopDomain) {
      return null;
    }
    return `https://${shopDomain}/admin/settings/checkout/editor/?page=information&context=apps`;
  }, [shopDomain]);

  const handleManageSettings = useCallback(() => {
    if (!checkoutSettingsUrl) return;
    
    setIsOpeningSettings(true);
    // Auto-refresh status after 20 seconds
    setTimeout(() => {
      setIsOpeningSettings(false);
      checkExtensionStatus();
    }, 20000);
    // Simple window.open - works in most cases
    const newWindow = open(checkoutSettingsUrl, "_blank");
    console.log("newWindow", newWindow);
    
  }, [checkoutSettingsUrl]);

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