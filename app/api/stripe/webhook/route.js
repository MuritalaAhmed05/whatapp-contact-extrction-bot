import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Must use the service role key to bypass RLS and securely update subscriptions
);

export async function POST(req) {
  const payload = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event;

  try {
    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
    } else {
      // Fallback for local testing without webhook secret, not recommended for prod
      event = JSON.parse(payload);
    }
  } catch (err) {
    console.error('Webhook Error:', err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Handle the checkout session completion
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const phoneNumber = session.client_reference_id || session.metadata?.phoneNumber;
    const tier = session.metadata?.tier;
    const customerId = session.customer;

    if (phoneNumber && tier) {
      // Upsert the user subscription in Supabase
      const { error } = await supabase
        .from('user_subscriptions')
        .upsert({ 
          phone_number: phoneNumber, 
          tier: tier,
          stripe_customer_id: customerId,
          subscription_status: 'active'
        }, { onConflict: 'phone_number' });

      if (error) {
        console.error('Supabase Upsert Error:', error);
      }
    }
  }

  // Handle subscription cancellations or status updates
  if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    const subscription = event.data.object;
    const customerId = subscription.customer;
    const status = subscription.status;

    // Lookup by stripe_customer_id and update status
    const { error } = await supabase
      .from('user_subscriptions')
      .update({ subscription_status: status })
      .eq('stripe_customer_id', customerId);

    if (error) {
      console.error('Supabase Status Update Error:', error);
    }
  }

  return NextResponse.json({ received: true });
}
