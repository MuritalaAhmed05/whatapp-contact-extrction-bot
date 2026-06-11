import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (jsonErr) {
      return NextResponse.json({ error: 'Invalid or empty JSON body' }, { status: 400 });
    }

    const { phoneNumber, tier } = body || {};

    if (!phoneNumber || !tier) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    let priceAmount;
    if (tier === 'pro') {
      priceAmount = parseInt(process.env.STRIPE_PRICE_ID_PRO) * 100;
    } else if (tier === 'unlimited') {
      priceAmount = parseInt(process.env.STRIPE_PRICE_ID_UNLIMITED) * 100;
    } else {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }

    if (!priceAmount) {
      return NextResponse.json({ error: 'Stripe price amounts not configured in .env' }, { status: 500 });
    }

    // 1. Query Supabase for existing subscription
    const { data: userSub } = await supabase
      .from('user_subscriptions')
      .select('stripe_customer_id, tier')
      .eq('phone_number', phoneNumber)
      .single();

    if (userSub && userSub.stripe_customer_id) {
      // 2. Fetch active subscriptions from Stripe
      const subscriptions = await stripe.subscriptions.list({
        customer: userSub.stripe_customer_id,
        status: 'active',
        limit: 1,
      });

      if (subscriptions.data.length > 0 && userSub.tier !== tier) {
        // Handle Mid-way Upgrade
        const activeSub = subscriptions.data[0];
        const subscriptionItemId = activeSub.items.data[0].id;

        // Dynamically create a Stripe Price object required for subscriptions.update
        const newPrice = await stripe.prices.create({
          currency: 'ngn',
          unit_amount: priceAmount,
          recurring: { interval: 'month' },
          product_data: { 
            name: tier === 'pro' ? 'Pro Plan' : 'Unlimited Plan' 
          }
        });

        // Update Subscription with Proration
        const updatedSubscription = await stripe.subscriptions.update(
          activeSub.id,
          {
            items: [{ id: subscriptionItemId, price: newPrice.id }],
            proration_behavior: 'always_invoice',
            payment_behavior: 'pending_if_incomplete',
            expand: ['latest_invoice.payment_intent'], // Fetch invoice state to check 3D secure
          }
        );

        // Check if 3D Secure / additional action is required
        if (updatedSubscription.latest_invoice?.payment_intent?.status === 'requires_action') {
          return NextResponse.json({ 
            success: true, 
            requires_action_url: updatedSubscription.latest_invoice.hosted_invoice_url 
          });
        }

        // Instant success: Update tier in Supabase immediately
        await supabase
          .from('user_subscriptions')
          .update({ tier: tier })
          .eq('stripe_customer_id', userSub.stripe_customer_id);

        return NextResponse.json({ success: true, upgraded: true });
      }
    }

    // Fallback: Standard Checkout Session for new subscriptions
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'ngn',
            product_data: {
              name: tier === 'pro' ? 'Pro Plan' : 'Unlimited Plan',
              description: tier === 'pro' ? '10 Extractions/day, Max 50% (1/2) Contacts' : 'Unlimited Extractions & Contacts',
            },
            unit_amount: priceAmount,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}?canceled=true`,
      client_reference_id: phoneNumber,
      metadata: { phoneNumber, tier }
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Stripe Checkout Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
