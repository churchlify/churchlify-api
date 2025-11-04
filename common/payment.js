const DonationPlan = require('../models/donationPlans');
const Setting = require('../models/settings');
const user = require('../models/user');
const Donation = require('../models/donations'); 
const crypto = require('crypto');
const {KEY_REGISTRY} = require('./key.registry');
const IV_LENGTH = 16;
const paypal = require('@paypal/checkout-server-sdk');
const PAYSTACK_API = 'https://api.paystack.co';
const PAYPAL_API = 'https://api-m.sandbox.paypal.com';
const fetch = require('node-fetch');
const axios = require('axios');
const arrSecrets = ['stripe','paypal','paystack','payment','payment_card'];
 
 const generateUniqueReference = (timestamp = Date.now()) => {
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `churchlify_${timestamp}_${randomPart}`;
};

const createDonation = async(donation) =>{
  const newDonation = new Donation(donation);
  return await newDonation.save();
};

const getUser = async (userId) => {
      return await user.findById(userId);
  };

const getPaypalClient = (data) => {
  const mode = (data && (data.provider==='paypal') && data.mode) || process.env.PAYPAL_MODE || 'sandbox';
  if (mode === 'live') {
    return new paypal.core.PayPalHttpClient(new paypal.core.LiveEnvironment(data.clientId, data.clientSecret));
  }
  return new paypal.core.PayPalHttpClient(new paypal.core.SandboxEnvironment(data.clientId, data.clientSecret));
};

const getPayPalAccessToken = async(clientId, secret) => {
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await response.json();
  if (!response.ok) {throw new Error(data.error_description || 'Failed to get PayPal token');}
  return data.access_token;
};


const encrypt = (input, version = 'v1') => {
  const key = Buffer.from(KEY_REGISTRY[version], 'utf8');
  const iv = crypto.randomBytes(IV_LENGTH);
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (encryptedText, version) => {
  const key = Buffer.from(KEY_REGISTRY[version], 'utf8');
  const [ivHex, encryptedHex] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  const decryptedString = decrypted.toString('utf8');
  try {
    return JSON.parse(decryptedString);
  } catch {
    return decryptedString;
  }
};

const getPaymentSettings = async (churchId) => {
  const regex = arrSecrets.join('|');
  const settings = await Setting.findOne({ church: churchId, key: { $regex: regex, $options: 'i' }}).populate('church');
  if (!settings) {throw new Error('Church payment settings not found');}
  return decrypt(settings.value, settings.keyVersion); // returns { key, provider }
};

const getOrCreatePlan =  async function ({churchId, name, amount,interval,currency = 'NGN'}) {
  console.log({churchId, name, amount,interval,currency});

  try {
    const { secretKey, provider } = await getPaymentSettings(churchId);
    if (!secretKey) {throw new Error('Missing payment API key for this church');}
    let plan = await DonationPlan.findOne({churchId, amount, interval,provider});

    if (plan) {
      return plan;
    }
    const res = await axios.post(`${PAYSTACK_API}/plan`, { name, amount: amount * 100, interval, currency},
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const { plan_code: planCode, id: providerId } = res.data.data;
    plan = await DonationPlan.create({
      churchId, planCode, name, amount,interval, provider: 'paystack',providerId,
    });
    return plan;
  } catch (error) {
    console.error('❌ Error in getOrCreatePlan:', error.response?.data || error);
    throw new Error('Failed to get or create Paystack plan');
  }
};

const getPaymentKey = (data) => {
  switch (data.provider) {
    case 'paypal':
      return data.clientId || '';
    case 'stripe':
      return data.publishableKey || '';
    case 'paystack':
      return data.publicKey || '';
    default:
      return '';
  }
};

const isSecret = (item) => {
  return arrSecrets.some(sub => item.toLowerCase().includes(sub.toLowerCase()));
};

module.exports = {encrypt, decrypt, isSecret, getPaymentKey, getPaymentSettings, generateUniqueReference, 
    getOrCreatePlan, getPayPalAccessToken, getPaypalClient, createDonation, getUser, arrSecrets};