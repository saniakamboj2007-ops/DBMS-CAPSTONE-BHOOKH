// ============================================================================
// BHOOKH — Order Lifecycle, Pricing Recalculation & Tracking Controller
// ============================================================================

const db = require('../models/database');
const config = require('../config/config');

exports.createOrder = async (req, res) => {
  try {
    const { delivery_address_id, payment_method, special_instructions, coupon_code } = req.body;

    let addressId = delivery_address_id ? parseInt(delivery_address_id, 10) : null;
    let address = null;

    if (addressId) {
      address = db.tables.user_addresses.find(a => a.address_id === addressId && a.user_id === req.user.user_id);
    }

    // Auto-create/save address record if user submitted an address during checkout
    if (!address) {
      const street = req.body.street_address || (req.body.new_address && req.body.new_address.street_address) || req.body.delivery_address_snapshot;
      if (!street || !street.trim()) {
        return res.status(400).json({ success: false, message: 'Delivery address is required. Please provide a street address.' });
      }
      const city = (req.body.new_address && req.body.new_address.city) || req.body.city || 'Sohna';
      const state = (req.body.new_address && req.body.new_address.state) || req.body.state || 'Haryana';
      const pincode = (req.body.new_address && req.body.new_address.pincode) || req.body.pincode || '122103';

      const newAddressRecord = {
        address_id: db.tables.user_addresses.length + 1,
        user_id: req.user.user_id,
        address_type: 'home',
        street_address: street.trim(),
        landmark: (req.body.new_address && req.body.new_address.landmark) || null,
        city: city,
        state: state,
        pincode: pincode,
        is_default: db.tables.user_addresses.filter(a => a.user_id === req.user.user_id).length === 0,
        created_at: new Date()
      };
      db.tables.user_addresses.push(newAddressRecord);
      address = newAddressRecord;
      addressId = newAddressRecord.address_id;
    }

    const payMethod = payment_method || 'Razorpay';
    if (!['Razorpay', 'COD'].includes(payMethod)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method. Must be Razorpay or COD.' });
    }

    const cart = db.getUserCart(req.user.user_id);
    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cannot place order. Your cart is empty.' });
    }

    const restaurant = db.findRestaurantById(cart.restaurant_id);
    if (!restaurant) {
      return res.status(400).json({ success: false, message: 'Restaurant is invalid or no longer active.' });
    }

    // BACKEND PRICING RECALCULATION & VALIDATION (Never trust frontend totals)
    let verifiedSubtotal = 0.00;
    const verifiedOrderItems = [];

    for (const ci of cart.items) {
      const liveItem = db.findMenuItemById(ci.item_id);
      if (!liveItem || !liveItem.is_available) {
        return res.status(400).json({ success: false, message: `Dish "${ci.item_name}" is currently unavailable.` });
      }
      const itemTotal = parseFloat((liveItem.price * ci.quantity).toFixed(2));
      verifiedSubtotal += itemTotal;
      verifiedOrderItems.push({
        item_id: liveItem.item_id,
        item_name: liveItem.name,
        unit_price: liveItem.price,
        quantity: ci.quantity,
        total_price: itemTotal
      });
    }

    let deliveryFee = verifiedSubtotal >= config.FREE_DELIVERY_THRESHOLD ? 0.00 : config.BASE_DELIVERY_FEE;
    let taxAmount = parseFloat((verifiedSubtotal * config.TAX_RATE).toFixed(2));
    let discountAmount = 0.00;

    // Coupon Verification
    if (coupon_code) {
      const codeUpper = coupon_code.trim().toUpperCase();
      const coupon = db.tables.coupons.find(c => c.code === codeUpper && c.is_active);
      if (coupon && verifiedSubtotal >= coupon.min_order_amount) {
        if (coupon.discount_type === 'flat') {
          discountAmount = coupon.discount_value;
        } else if (coupon.discount_type === 'percentage') {
          const calculated = (verifiedSubtotal * coupon.discount_value) / 100;
          discountAmount = coupon.max_discount ? Math.min(calculated, coupon.max_discount) : calculated;
        }
        discountAmount = parseFloat(discountAmount.toFixed(2));
      }
    }

    const totalAmount = parseFloat((verifiedSubtotal + deliveryFee + taxAmount - discountAmount).toFixed(2));
    const orderCode = `BHK-${new Date().getFullYear()}-${String(db.tables.orders.length + 1).padStart(4, '0')}`;
    const addressSnapshot = `${address.street_address}${address.landmark ? ', ' + address.landmark : ''}, ${address.city}, ${address.state} - ${address.pincode}`;

    const newOrder = {
      order_id: db.tables.orders.length + 1,
      order_code: orderCode,
      user_id: req.user.user_id,
      restaurant_id: restaurant.restaurant_id,
      delivery_address_id: address.address_id,
      delivery_address_snapshot: addressSnapshot,
      subtotal: verifiedSubtotal,
      delivery_fee: deliveryFee,
      tax_amount: taxAmount,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      order_status: 'Order Placed',
      payment_method: payment_method,
      payment_status: payment_method === 'COD' ? 'Pending' : 'Paid',
      special_instructions: special_instructions ? special_instructions.trim() : null,
      coupon_code: coupon_code ? coupon_code.trim().toUpperCase() : null,
      placed_at: new Date(),
      updated_at: new Date()
    };

    db.tables.orders.push(newOrder);

    // Save Order Items
    verifiedOrderItems.forEach(item => {
      db.tables.order_items.push({
        order_item_id: db.tables.order_items.length + 1,
        order_id: newOrder.order_id,
        ...item
      });
    });

    // Save Initial Payment Record
    const newPayment = {
      payment_id: db.tables.payments.length + 1,
      order_id: newOrder.order_id,
      payment_method: payment_method,
      transaction_reference: payment_method === 'COD' ? `COD_${Date.now()}` : `TXN_RZP_${Date.now()}`,
      razorpay_order_id: payment_method === 'Razorpay' ? `order_rzp_${Date.now()}` : null,
      razorpay_payment_id: payment_method === 'Razorpay' ? `pay_rzp_${Date.now()}` : null,
      amount: totalAmount,
      payment_status: payment_method === 'COD' ? 'Pending' : 'Success',
      created_at: new Date()
    };
    db.tables.payments.push(newPayment);

    // Save Order Status History
    db.tables.order_status_history.push({
      history_id: db.tables.order_status_history.length + 1,
      order_id: newOrder.order_id,
      status: 'Order Placed',
      comment: `Order placed via ${payment_method}. Demo order simulation.`,
      changed_by_user_id: req.user.user_id,
      changed_at: new Date()
    });

    // Clear user cart upon successful checkout
    db.clearCart(req.user.user_id);

    res.status(201).json({
      success: true,
      message: 'Order placed successfully on BHOOKH!',
      order: {
        ...newOrder,
        restaurant_name: restaurant.name,
        items: verifiedOrderItems,
        payment: newPayment
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create order.', error: error.message });
  }
};

exports.getUserOrders = async (req, res) => {
  try {
    const orders = db.tables.orders
      .filter(o => o.user_id === req.user.user_id)
      .sort((a, b) => new Date(b.placed_at) - new Date(a.placed_at))
      .map(o => {
        const restaurant = db.findRestaurantById(o.restaurant_id);
        const items = db.tables.order_items.filter(oi => oi.order_id === o.order_id);
        return {
          ...o,
          restaurant_name: restaurant ? restaurant.name : 'Restaurant',
          restaurant_image: restaurant ? restaurant.banner_image : null,
          items_count: items.reduce((acc, cur) => acc + cur.quantity, 0)
        };
      });

    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch orders.', error: error.message });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const order = db.tables.orders.find(o => o.order_id === orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // SECURITY OWNERSHIP CHECK (User can only view their own order unless Super Admin or assigned Rest Admin)
    const isCustomerOwner = req.user.role_id === 3 && order.user_id === req.user.user_id;
    const isSuperAdmin = req.user.role_id === 1;
    let isAssignedAdmin = false;
    if (req.user.role_id === 2) {
      const assignment = db.tables.restaurant_admins.find(ra => ra.user_id === req.user.user_id);
      if (assignment && assignment.restaurant_id === order.restaurant_id) isAssignedAdmin = true;
    }

    if (!isCustomerOwner && !isSuperAdmin && !isAssignedAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to view this order.' });
    }

    const restaurant = db.findRestaurantById(order.restaurant_id);
    const items = db.tables.order_items.filter(oi => oi.order_id === order.order_id);
    const payment = db.tables.payments.find(p => p.order_id === order.order_id);
    const history = db.tables.order_status_history
      .filter(h => h.order_id === order.order_id)
      .sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at));

    res.json({
      success: true,
      order: {
        ...order,
        restaurant_name: restaurant ? restaurant.name : 'Restaurant',
        restaurant_address: restaurant ? restaurant.street_address : '',
        restaurant_phone: restaurant ? restaurant.contact_phone : '',
        items,
        payment,
        status_history: history
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve order details.', error: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { status, comment } = req.body;

    const validStatuses = ['Order Placed', 'Confirmed', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid order status transition.' });
    }

    const order = db.tables.orders.find(o => o.order_id === orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    // Authorization
    if (req.user.role_id === 2) {
      const assignment = db.tables.restaurant_admins.find(ra => ra.user_id === req.user.user_id);
      if (!assignment || assignment.restaurant_id !== order.restaurant_id) {
        return res.status(403).json({ success: false, message: 'Unauthorized. You can only update orders for your outlet.' });
      }
    }

    order.order_status = status;
    order.updated_at = new Date();

    if (status === 'Delivered' && order.payment_method === 'COD') {
      const payment = db.tables.payments.find(p => p.order_id === order.order_id);
      if (payment) payment.payment_status = 'Success';
    }

    db.tables.order_status_history.push({
      history_id: db.tables.order_status_history.length + 1,
      order_id: order.order_id,
      status: status,
      comment: comment || `Status updated to ${status} by administrator.`,
      changed_by_user_id: req.user.user_id,
      changed_at: new Date()
    });

    res.json({ success: true, message: `Order status updated to ${status}.`, order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update order status.', error: error.message });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const order = db.tables.orders.find(o => o.order_id === orderId && o.user_id === req.user.user_id);

    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    if (order.order_status !== 'Order Placed') {
      return res.status(400).json({ success: false, message: 'Orders that are already confirmed or in preparation cannot be cancelled.' });
    }

    order.order_status = 'Cancelled';
    order.updated_at = new Date();

    db.tables.order_status_history.push({
      history_id: db.tables.order_status_history.length + 1,
      order_id: order.order_id,
      status: 'Cancelled',
      comment: 'Cancelled by customer.',
      changed_by_user_id: req.user.user_id,
      changed_at: new Date()
    });

    res.json({ success: true, message: 'Order cancelled successfully.', order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to cancel order.', error: error.message });
  }
};
