// ============================================================================
// BHOOKH — Cart Controller with Single-Restaurant Enforcement
// ============================================================================

const db = require('../models/database');
const config = require('../config/config');

exports.getCart = async (req, res) => {
  try {
    const cart = db.getUserCart(req.user.user_id);
    const subtotal = cart.subtotal;
    
    // Calculate delivery and tax according to business rules
    let deliveryFee = subtotal > 0 ? (subtotal >= config.FREE_DELIVERY_THRESHOLD ? 0.00 : config.BASE_DELIVERY_FEE) : 0.00;
    let taxAmount = parseFloat((subtotal * config.TAX_RATE).toFixed(2));
    let discountAmount = 0.00;
    let totalAmount = parseFloat((subtotal + deliveryFee + taxAmount - discountAmount).toFixed(2));

    res.json({
      success: true,
      cart: {
        ...cart,
        delivery_fee: deliveryFee,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total_amount: totalAmount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve cart.', error: error.message });
  }
};

exports.addToCart = async (req, res) => {
  try {
    const { item_id, quantity = 1, force_clear = false } = req.body;

    if (!item_id) {
      return res.status(400).json({ success: false, message: 'item_id is required.' });
    }

    const result = db.addItemToCart(req.user.user_id, item_id, quantity, force_clear);

    if (result.conflict) {
      return res.status(409).json({
        success: false,
        conflict: true,
        message: result.message,
        currentRestaurant: result.currentRestaurant,
        newRestaurant: result.newRestaurant
      });
    }

    const updatedCart = db.getUserCart(req.user.user_id);
    res.json({
      success: true,
      message: 'Item added to your BHOOKH cart.',
      cart: updatedCart
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add item to cart.', error: error.message });
  }
};

exports.updateQuantity = async (req, res) => {
  try {
    const { cart_item_id, quantity } = req.body;

    if (!cart_item_id || quantity === undefined) {
      return res.status(400).json({ success: false, message: 'cart_item_id and quantity are required.' });
    }

    db.updateCartItemQuantity(req.user.user_id, cart_item_id, parseInt(quantity, 10));
    const updatedCart = db.getUserCart(req.user.user_id);

    res.json({
      success: true,
      message: 'Cart updated.',
      cart: updatedCart
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update quantity.', error: error.message });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const cartItemId = parseInt(req.params.id, 10);
    db.updateCartItemQuantity(req.user.user_id, cartItemId, 0);
    const updatedCart = db.getUserCart(req.user.user_id);

    res.json({
      success: true,
      message: 'Item removed from cart.',
      cart: updatedCart
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to remove item.', error: error.message });
  }
};

exports.clearCart = async (req, res) => {
  try {
    db.clearCart(req.user.user_id);
    res.json({
      success: true,
      message: 'Cart cleared successfully.',
      cart: db.getUserCart(req.user.user_id)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to clear cart.', error: error.message });
  }
};
