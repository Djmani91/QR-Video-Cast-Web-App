import { ReplitConnectors } from '@replit/connectors-sdk';

type RevenueCatClient = {
  get(path: string): Promise<any>;
};

async function getUncachableRevenueCatClient(): Promise<RevenueCatClient> {
  const connectors = new ReplitConnectors();

  return {
    async get(path) {
      const response = await connectors.proxy('revenuecat', `/v2${path}`, {
        method: 'GET',
      });
      if (!response.ok) {
        throw new Error(`RevenueCat GET ${path} failed with HTTP ${response.status}`);
      }
      return response.json();
    },
  };
}

function items(value: any): any[] {
  return Array.isArray(value?.items) ? value.items : [];
}

async function inspectRevenueCat() {
  const projectId = process.env.REVENUECAT_PROJECT_ID;
  if (!projectId) {
    throw new Error('REVENUECAT_PROJECT_ID is not configured in this environment.');
  }

  const client = await getUncachableRevenueCatClient();
  const projectPath = `/projects/${encodeURIComponent(projectId)}`;

  const [appsResponse, productsResponse, entitlementsResponse, offeringsResponse] =
    await Promise.all([
      client.get(`${projectPath}/apps?limit=100`),
      client.get(`${projectPath}/products?limit=100`),
      client.get(`${projectPath}/entitlements?limit=100`),
      client.get(`${projectPath}/offerings?limit=100`),
    ]);

  const apps = items(appsResponse);
  const products = items(productsResponse);
  const entitlements = items(entitlementsResponse);
  const offerings = items(offeringsResponse);

  const [entitlementProducts, offeringPackages] = await Promise.all([
    Promise.all(
      entitlements.map(async (entitlement) => {
        const response = await client.get(
          `${projectPath}/entitlements/${encodeURIComponent(entitlement.id)}/products?limit=100`,
        );
        return {
          id: entitlement.id,
          lookupKey: entitlement.lookup_key,
          displayName: entitlement.display_name,
          products: items(response).map((product) => ({
            id: product.id ?? null,
            productId: product.product_id ?? null,
            appId: product.app_id ?? product.product?.app_id ?? null,
            storeIdentifier: product.store_identifier ?? product.product?.store_identifier ?? null,
            displayName: product.display_name ?? product.product?.display_name ?? null,
          })),
        };
      }),
    ),
    Promise.all(
      offerings.map(async (offering) => {
        const packagesResponse = await client.get(
          `${projectPath}/offerings/${encodeURIComponent(offering.id)}/packages?limit=100`,
        );
        const packages = items(packagesResponse);
        const packageDetails = await Promise.all(
          packages.map(async (pkg) => {
            const productsResponseForPackage = await client.get(
              `${projectPath}/packages/${encodeURIComponent(pkg.id)}/products?limit=100`,
            );
            return {
              id: pkg.id,
              lookupKey: pkg.lookup_key,
              displayName: pkg.display_name,
              products: items(productsResponseForPackage).map((product) => ({
                keys: Object.keys(product),
                id: product.id ?? null,
                productId: product.product_id ?? null,
                appId: product.app_id ?? product.product?.app_id ?? null,
                storeIdentifier: product.store_identifier ?? product.product?.store_identifier ?? null,
                displayName: product.display_name ?? product.product?.display_name ?? null,
                eligibilityCriteria: product.eligibility_criteria ?? null,
                nestedProduct: product.product
                  ? {
                      id: product.product.id ?? null,
                      storeIdentifier: product.product.store_identifier ?? null,
                      displayName: product.product.display_name ?? null,
                    }
                  : null,
              })),
            };
          }),
        );

        return {
          id: offering.id,
          lookupKey: offering.lookup_key,
          displayName: offering.display_name,
          isCurrent: offering.is_current,
          packages: packageDetails,
        };
      }),
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        apps: apps.map((app) => ({
          id: app.id,
          name: app.name,
          type: app.type,
          packageName: app.play_store?.package_name ?? null,
          hasPlayCredentials: Boolean(app.play_store?.play_service_account_credentials_json),
        })),
        products: products.map((product) => ({
          id: product.id,
          appId: product.app_id,
          storeIdentifier: product.store_identifier,
          type: product.type,
          displayName: product.display_name,
          isArchived: product.is_archived ?? false,
        })),
        entitlements: entitlementProducts,
        offerings: offeringPackages,
      },
      null,
      2,
    ),
  );
}

inspectRevenueCat().catch((error) => {
  console.error(error instanceof Error ? error.message : 'RevenueCat inspection failed.');
  process.exitCode = 1;
});
