import { createOrder, buildMockWebhookEvent, verifyWebhookSignature } from '../src/lib/razorpay'

async function main() {
  console.log('--- Test 2a: mock order creation ---')
  const order = await createOrder({ amount: 4900 })
  console.log('order id:', order.id)
  console.log('pass:', order.id.startsWith('order_mock_'))

  // buildMockWebhookEvent returns the exact bytes it signed as `rawBody` — verify
  // against THOSE, not a re-stringified envelope, or the test proves nothing.
  console.log('\n--- Test 2b: valid signature ---')
  const { rawBody, signature } = buildMockWebhookEvent('payment.captured', { amount: 4900 })
  const validResult = verifyWebhookSignature(rawBody, signature)
  console.log('valid signature verifies:', validResult)
  console.log('pass:', validResult === true)

  console.log('\n--- Test 2c: tampered body ---')
  const tampered = rawBody.replace('4900', '4901')
  const tamperedResult = verifyWebhookSignature(tampered, signature)
  console.log('tampered body verifies:', tamperedResult)
  console.log('pass:', tamperedResult === false)
}

main().catch((e) => {
  console.error('test failed:', e)
  process.exit(1)
})
