import { createOrder, verifyWebhookSignature } from '../src/lib/razorpay'

async function main() {
  console.log('NODE_ENV:', process.env.NODE_ENV)
  console.log('expected: production\n')

  console.log('--- Test 3a: createOrder refuses without credentials ---')
  try {
    const order = await createOrder({ amount: 4900 })
    console.log('FAIL: should have thrown, got:', order.id)
    process.exit(1)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.log('threw as expected:', msg)
    console.log('pass:', msg.toLowerCase().includes('missing credentials'))
  }

  console.log('\n--- Test 3b: verifyWebhookSignature refuses without secret ---')
  // Feed it any plausible-looking hex signature — verify should refuse
  // in production without a real secret, no matter what we pass in.
  const rawBody = JSON.stringify({ event: 'payment.captured' })
  const fakeSignature = 'a'.repeat(64) // 64-char hex, right shape for HMAC-SHA256
  const result = verifyWebhookSignature(rawBody, fakeSignature)
  console.log('verify result:', result)
  console.log('pass:', result === false)
}

main().catch((e) => {
  console.error('test failed:', e)
  process.exit(1)
})
