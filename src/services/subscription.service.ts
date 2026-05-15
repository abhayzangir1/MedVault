import { supabase } from '@/lib/supabase';
import { GOOGLE_PLAY_PRODUCT_IDS } from '@/lib/constants';
import { getBillingRegion } from '@/lib/subscription';
import type { BillingRegion, GooglePlayPurchaseVerificationInput, Profile } from '@/types';

export interface SubscriptionCheckout {
  subscriptionId: string;
  shortUrl: string | null;
  region: BillingRegion;
  priceLabel: string;
}

export interface GooglePlayEntitlementResult {
  verified: boolean;
  plan: 'free' | 'pro_family';
  subscriptionStatus: string;
  productId: string;
  expiresAt?: string | null;
}

export const subscriptionService = {
  getRegionForProfile(profile: Profile | null): BillingRegion {
    return profile?.billing_region ?? getBillingRegion(profile?.country);
  },

  getGooglePlayProductId() {
    return GOOGLE_PLAY_PRODUCT_IDS.proFamilyMonthly;
  },

  async verifyGooglePlayPurchase(payload: Omit<GooglePlayPurchaseVerificationInput, 'productId'> & { productId?: string }) {
    const { data, error } = await supabase.functions.invoke<GooglePlayEntitlementResult>('verify-google-play-purchase', {
      body: {
        productId: payload.productId ?? this.getGooglePlayProductId(),
        purchaseToken: payload.purchaseToken,
        packageName: payload.packageName
      }
    });

    if (error) throw error;
    if (!data?.verified) throw new Error('Google Play purchase could not be verified.');
    return data;
  },

  async createRazorpaySubscription(profile: Profile) {
    const region = this.getRegionForProfile(profile);
    const { data, error } = await supabase.functions.invoke<SubscriptionCheckout>('create-razorpay-subscription', {
      body: { region }
    });

    if (error) throw error;
    if (!data?.subscriptionId) throw new Error('Subscription checkout was not created.');
    return data;
  },

  async verifyRazorpayPayment(payload: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  }) {
    const { data, error } = await supabase.functions.invoke<{ verified: boolean }>('verify-razorpay-payment', {
      body: payload
    });

    if (error) throw error;
    return data?.verified === true;
  }
};
