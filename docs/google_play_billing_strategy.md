# Google Play Billing Strategy

MedVault Android subscriptions should use Google Play Billing first for Play Store distribution.

## Product

- Subscription product ID: `medvault_pro_family_monthly`
- Base plan: monthly
- India price: INR 299/month
- International target price: USD 9.99/month, configured through Play regional pricing

## App Behavior

- The app shows Google Play's billing sheet for subscription purchase.
- The app sends the purchase token to a Supabase Edge Function named `verify-google-play-purchase`.
- Pro Family unlocks only after backend verification stores an active entitlement.
- The mobile app never stores Google service-account JSON or private billing credentials.
- The verifier uses the Google Play Developer API `purchases.subscriptionsv2.get` and only unlocks Pro Family when the returned product matches `medvault_pro_family_monthly` and the state is active or in grace period.

## Required From User Later

Ask only during billing integration/testing:

- Google Play Console access readiness.
- Android package name confirmation, currently `com.medvault.app`.
- Subscription product ID and base plan ID as configured in Play Console.
- License tester Google account.
- Google service-account JSON for the backend verification function.
- EAS account/build profile details for a development build or internal-test APK/AAB.
- Play Console base plan ID for final internal-test validation.

## Razorpay Position

Razorpay is not the default in-app checkout path for Play Store builds. It can remain as future optional infrastructure for web checkout, non-Play distribution, or approved alternative billing where Google Play's requirements are satisfied.
