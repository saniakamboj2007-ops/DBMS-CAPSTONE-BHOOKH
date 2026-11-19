// ============================================================================
// BHOOKH — Menu & Dish Management Controller
// ============================================================================

const db = require('../models/database');

exports.getRestaurantMenu = async (req, res) => {
  try {
    const restaurantId = parseInt(req.params.restaurantId, 10);
    const categories = db.getRestaurantCategories(restaurantId);
    const items = db.tables.menu_items.filter(m => m.restaurant_id === restaurantId);

    res.json({
      success: true,
      restaurant_id: restaurantId,
      categories,
      items
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch menu.', error: error.message });
  }
};

exports.addMenuItem = async (req, res) => {
  try {
    const { restaurant_id, category_id, name, description, price, is_veg, is_popular, image_url } = req.body;

    if (!restaurant_id || !category_id || !name || price === undefined) {
      return res.status(400).json({ success: false, message: 'restaurant_id, category_id, name, and price are required.' });
    }

    if (parseFloat(price) < 0) {
      return res.status(400).json({ success: false, message: 'Price cannot be negative.' });
    }

    // Role verification: If restaurant admin, can only edit assigned restaurant
    if (req.user.role_id === 2) {
      const assignment = db.tables.restaurant_admins.find(ra => ra.user_id === req.user.user_id);
      if (!assignment || assignment.restaurant_id !== parseInt(restaurant_id, 10)) {
        return res.status(403).json({ success: false, message: 'Unauthorized. You can only manage your assigned restaurant.' });
      }
    }

    const newItem = {
      item_id: db.tables.menu_items.length + 1,
      restaurant_id: parseInt(restaurant_id, 10),
      category_id: parseInt(category_id, 10),
      name: name.trim(),
      description: description ? description.trim() : '',
      price: parseFloat(price),
      is_veg: Boolean(is_veg),
      is_available: true,
      is_popular: Boolean(is_popular),
      image_url: image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80',
      created_at: new Date()
    };

    db.tables.menu_items.push(newItem);
    res.status(201).json({ success: true, message: 'Menu item created successfully.', item: newItem });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add menu item.', error: error.message });
  }
};

exports.updateMenuItem = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const item = db.findMenuItemById(id);

    if (!item) {
      return res.status(404).json({ success: false, message: 'Menu item not found.' });
    }

    // Ownership check
    if (req.user.role_id === 2) {
      const assignment = db.tables.restaurant_admins.find(ra => ra.user_id === req.user.user_id);
      if (!assignment || assignment.restaurant_id !== item.restaurant_id) {
        return res.status(403).json({ success: false, message: 'Unauthorized to modify this menu item.' });
      }
    }

    const { name, description, price, is_veg, is_available, is_popular, image_url, category_id } = req.body;

    if (name) item.name = name.trim();
    if (description !== undefined) item.description = description.trim();
    if (price !== undefined) {
      if (parseFloat(price) < 0) return res.status(400).json({ success: false, message: 'Price cannot be negative.' });
      item.price = parseFloat(price);
    }
    if (is_veg !== undefined) item.is_veg = Boolean(is_veg);
    if (is_available !== undefined) item.is_available = Boolean(is_available);
    if (is_popular !== undefined) item.is_popular = Boolean(is_popular);
    if (image_url) item.image_url = image_url;
    if (category_id) item.category_id = parseInt(category_id, 10);

    item.updated_at = new Date();
    res.json({ success: true, message: 'Menu item updated successfully.', item });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update menu item.', error: error.message });
  }
};

exports.deleteMenuItem = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const index = db.tables.menu_items.findIndex(m => m.item_id === id);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Menu item not found.' });
    }

    const item = db.tables.menu_items[index];

    // Ownership check
    if (req.user.role_id === 2) {
      const assignment = db.tables.restaurant_admins.find(ra => ra.user_id === req.user.user_id);
      if (!assignment || assignment.restaurant_id !== item.restaurant_id) {
        return res.status(403).json({ success: false, message: 'Unauthorized to delete this menu item.' });
      }
    }

    db.tables.menu_items.splice(index, 1);
    res.json({ success: true, message: 'Menu item removed successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete menu item.', error: error.message });
  }
};
