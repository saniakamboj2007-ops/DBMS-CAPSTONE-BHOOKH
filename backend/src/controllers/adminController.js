// ============================================================================
// BHOOKH — Admin Controller (Super Admin & Restaurant Admin Workspaces)
// ============================================================================

const db = require('../models/database');

// ----------------------------------------------------------------------------
// SUPER ADMIN ENDPOINTS
// ----------------------------------------------------------------------------

exports.getSuperAdminStats = async (req, res) => {
  try {
    const totalOrders = db.tables.orders.length;
    const deliveredOrders = db.tables.orders.filter(o => o.order_status === 'Delivered');
    const totalRevenue = deliveredOrders.reduce((acc, o) => acc + o.total_amount, 0);
    const totalCustomers = db.tables.users.filter(u => u.role_id === 3).length;
    const totalRestaurants = db.tables.restaurants.length;
    const activeRestaurants = db.tables.restaurants.filter(r => r.is_active).length;

    // Status breakdown
    const statusCounts = {};
    db.tables.orders.forEach(o => {
      statusCounts[o.order_status] = (statusCounts[o.order_status] || 0) + 1;
    });

    // Recent orders
    const recentOrders = db.tables.orders
      .slice(-6)
      .reverse()
      .map(o => {
        const u = db.findUserById(o.user_id);
        const r = db.findRestaurantById(o.restaurant_id);
        return {
          ...o,
          customer_name: u ? u.full_name : 'Customer',
          restaurant_name: r ? r.name : 'Restaurant'
        };
      });

    res.json({
      success: true,
      stats: {
        total_orders: totalOrders,
        total_revenue: parseFloat(totalRevenue.toFixed(2)),
        total_customers: totalCustomers,
        total_restaurants: totalRestaurants,
        active_restaurants: activeRestaurants,
        status_breakdown: statusCounts,
        recent_orders: recentOrders
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch admin stats.', error: error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = db.tables.users.map(u => ({
      user_id: u.user_id,
      full_name: u.full_name,
      email: u.email,
      phone: u.phone,
      role_id: u.role_id,
      role_name: u.role_id === 1 ? 'super_admin' : (u.role_id === 2 ? 'restaurant_admin' : 'customer'),
      status: u.status,
      created_at: u.created_at
    }));
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch users.', error: error.message });
  }
};

exports.getAllRestaurantsAdmin = async (req, res) => {
  try {
    const list = db.tables.restaurants.map(r => {
      const assignment = db.tables.restaurant_admins.find(ra => ra.restaurant_id === r.restaurant_id);
      const manager = assignment ? db.findUserById(assignment.user_id) : null;
      const orderCount = db.tables.orders.filter(o => o.restaurant_id === r.restaurant_id).length;
      return {
        ...r,
        manager_name: manager ? manager.full_name : 'Unassigned',
        manager_email: manager ? manager.email : null,
        order_count: orderCount
      };
    });
    res.json({ success: true, restaurants: list });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch restaurants for admin.', error: error.message });
  }
};

exports.addRestaurant = async (req, res) => {
  try {
    const { name, cuisine_type, pure_veg, street_address, locality, city, state, pincode, average_cost_for_two, contact_phone, verification_source } = req.body;

    if (!name || !cuisine_type || !street_address || !locality || !verification_source) {
      return res.status(400).json({ success: false, message: 'Name, cuisine, address, locality, and verification_source are required.' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const newRest = {
      restaurant_id: db.tables.restaurants.length + 1,
      name: name.trim(),
      slug: `${slug}-${Date.now()}`,
      tagline: req.body.tagline || 'Genuine Local Dining Outlet',
      description: req.body.description || 'Verified restaurant serving fresh dishes.',
      cuisine_type: cuisine_type.trim(),
      pure_veg: Boolean(pure_veg),
      street_address: street_address.trim(),
      locality: locality.trim(),
      city: city || 'Sohna',
      state: state || 'Haryana',
      pincode: pincode || '122103',
      contact_phone: contact_phone || '+91 98123 45600',
      contact_email: req.body.contact_email || `${slug}@bhookh.in`,
      opening_time: req.body.opening_time || '10:00:00',
      closing_time: req.body.closing_time || '23:00:00',
      average_cost_for_two: parseFloat(average_cost_for_two || 400),
      rating: 4.0,
      review_count: 0,
      banner_image: req.body.banner_image || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
      logo_image: req.body.logo_image || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=200&q=80',
      is_active: true,
      verification_source: verification_source.trim(),
      verification_status: 'VERIFIED_ACTIVE',
      last_verified_at: new Date().toISOString().split('T')[0],
      created_at: new Date()
    };

    db.tables.restaurants.push(newRest);
    res.status(201).json({ success: true, message: 'Verified restaurant added to BHOOKH.', restaurant: newRest });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add restaurant.', error: error.message });
  }
};

exports.toggleRestaurantStatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const restaurant = db.findRestaurantById(id);
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found.' });

    restaurant.is_active = !restaurant.is_active;
    res.json({ success: true, message: `Restaurant ${restaurant.is_active ? 'activated' : 'deactivated'}.`, is_active: restaurant.is_active });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to toggle status.', error: error.message });
  }
};

exports.getAllOrdersAdmin = async (req, res) => {
  try {
    const orders = db.tables.orders
      .sort((a, b) => new Date(b.placed_at) - new Date(a.placed_at))
      .map(o => {
        const u = db.findUserById(o.user_id);
        const r = db.findRestaurantById(o.restaurant_id);
        return {
          ...o,
          customer_name: u ? u.full_name : 'Customer',
          customer_phone: u ? u.phone : '',
          restaurant_name: r ? r.name : 'Restaurant'
        };
      });
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch orders.', error: error.message });
  }
};

// ----------------------------------------------------------------------------
// RESTAURANT ADMIN ENDPOINTS
// ----------------------------------------------------------------------------

exports.getRestaurantAdminDashboard = async (req, res) => {
  try {
    const assignment = db.tables.restaurant_admins.find(ra => ra.user_id === req.user.user_id);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'No restaurant currently assigned to your account.' });
    }

    const restaurant = db.findRestaurantById(assignment.restaurant_id);
    const menuItems = db.tables.menu_items.filter(m => m.restaurant_id === assignment.restaurant_id);
    const categories = db.tables.menu_categories.filter(c => c.restaurant_id === assignment.restaurant_id);
    const orders = db.tables.orders
      .filter(o => o.restaurant_id === assignment.restaurant_id)
      .sort((a, b) => new Date(b.placed_at) - new Date(a.placed_at));

    const totalRevenue = orders
      .filter(o => o.order_status === 'Delivered')
      .reduce((acc, o) => acc + o.total_amount, 0);

    res.json({
      success: true,
      restaurant,
      categories,
      menu_items: menuItems,
      orders,
      stats: {
        total_items: menuItems.length,
        total_orders: orders.length,
        pending_orders: orders.filter(o => ['Order Placed', 'Confirmed', 'Preparing'].includes(o.order_status)).length,
        delivered_revenue: parseFloat(totalRevenue.toFixed(2))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load restaurant dashboard.', error: error.message });
  }
};
