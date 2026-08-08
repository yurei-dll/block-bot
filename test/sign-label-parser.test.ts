import { describe, expect, it } from 'vitest'
import { parseLocationSign } from '../src/locations/sign-label-parser.js'

describe('parseLocationSign', () => {
  it('parses a strict front-side designation', () => {
    expect(parseLocationSign('[block-bot]\nhome-pantry\nstorage,pickup\nfood')).toEqual({
      status: 'parsed',
      label: {
        id: 'home-pantry',
        roles: ['storage', 'pickup'],
        categories: ['food'],
        side: 'front',
      },
    })
  })

  it('can use the back of a modern sign', () => {
    expect(parseLocationSign('hello', '[block-bot]\nfarm-output\ndropoff\nfarming,food')).toEqual({
      status: 'parsed',
      label: {
        id: 'farm-output',
        roles: ['dropoff'],
        categories: ['farming', 'food'],
        side: 'back',
      },
    })
  })

  it('ignores ordinary signs', () => {
    expect(parseLocationSign('definitely not for the bot')).toEqual({ status: 'ignored' })
  })

  it('rejects unknown roles after the explicit marker', () => {
    expect(parseLocationSign('[block-bot]\npantry\nexplode\nfood')).toMatchObject({
      status: 'invalid',
    })
  })

  it('rejects contradictory front and back labels', () => {
    expect(
      parseLocationSign(
        '[block-bot]\npantry\npickup\nfood',
        '[block-bot]\ntrash\ndropoff\nmisc',
      ),
    ).toEqual({ status: 'invalid', message: 'front and back labels disagree' })
  })
})
