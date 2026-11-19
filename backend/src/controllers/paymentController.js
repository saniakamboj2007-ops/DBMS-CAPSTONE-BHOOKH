// ============================================================================
// BHOOKH — Payment Controller (Razorpay Test Mode & COD Simulation)
// ============================================================================

const db = require('../models/database');
const config = require('../config/config');
const crypto = require('crypto');

exports.createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid payment amount is required.' });
    }

    // Razorpay works in paise (amount * 100)
    const amountInPaise = Math.round(parseFloat(amount) * 100);
    const mockRazorpayOrderId = `order_rzp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    res.json({
      success: true,
      key_id: config.RAZORPAY_KEY_ID,
      razorpay_order_id: mockRazorpayOrderId,
      amount: amountInPaise,
      currency,
      receipt: receipt || `rcpt_${Date.now()}`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to initiate Razorpay order.', error: error.message });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!order_id || !razorpay_payment_id) {
      return res.status(400).json({ success: false, message: 'Order ID and Razorpay Payment ID are required.' });
    }

    const order = db.tables.orders.find(o => o.order_id === parseInt(order_id, 10));
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    let payment = db.tables.payments.find(p => p.order_id === order.order_id);
    if (!payment) {
      payment = {
        payment_id: db.tables.payments.length + 1,
        order_id: order.order_id,
        payment_method: 'Razorpay',
        transaction_reference: `TXN_${razorpay_payment_id}`,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature: razorpay_signature || `sig_valid_${Date.now()}`,
        amount: order.total_amount,
        payment_status: 'Success',
        created_at: new Date()
      };
      db.tables.payments.push(payment);
    } else {
      payment.razorpay_order_id = razorpay_order_id;
      payment.razorpay_payment_id = razorpay_payment_id;
      payment.razorpay_signature = razorpay_signature || `sig_valid_${Date.now()}`;
      payment.payment_status = 'Success';
    }

    order.payment_status = 'Paid';
    order.updated_at = new Date();

    res.json({
      success: true,
      message: 'Razorpay test payment verified successfully.',
      payment
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Payment verification failed.', error: error.message });
  }
};
