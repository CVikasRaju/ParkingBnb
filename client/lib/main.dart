import 'package:flutter/material.dart';

import 'core/api_client.dart';
import 'core/deep_link.dart';
import 'features/admin/admin_screen.dart';
import 'features/map/map_screen.dart';
import 'features/provider/provider_dashboard_screen.dart';
import 'features/booking/booking_history_screen.dart';
import 'features/profile/vehicles_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = ApiClient();
  await api.restoreSession();
  runApp(ParkPeerApp(api: api));
}

class ParkPeerApp extends StatelessWidget {
  const ParkPeerApp({required this.api, super.key});

  final ApiClient api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ParkPeer',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF00897B)),
        useMaterial3: true,
      ),
      home: AuthGate(api: api),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({required this.api, super.key});

  final ApiClient api;

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  @override
  Widget build(BuildContext context) {
    if (!widget.api.isAuthenticated) {
      return LoginScreen(api: widget.api);
    }
    return HomeShell(api: widget.api);
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.login(_email.text.trim(), _password.text);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(builder: (_) => HomeShell(api: widget.api)),
      );
    } on ApiException catch (e) {
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 340),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.local_parking, size: 64, color: Colors.teal),
              const SizedBox(height: 8),
              const Text('ParkPeer',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              const Text('Peer-to-peer parking, done right.'),
              const SizedBox(height: 24),
              TextField(
                controller: _email,
                decoration: const InputDecoration(
                  labelText: 'Email',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  border: OutlineInputBorder(),
                ),
                onSubmitted: (_) => _login(),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _busy ? null : _login,
                  child: _busy
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Log in'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class HomeShell extends StatelessWidget {
  const HomeShell({required this.api, super.key});

  final ApiClient api;

  Widget _buildDrawer(BuildContext context) {
    final role = api.role ?? 'driver';
    return Drawer(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          DrawerHeader(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFF00695C), Color(0xFF00897B)],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                const Icon(Icons.local_parking, size: 40, color: Colors.white),
                const SizedBox(height: 8),
                const Text('ParkPeer', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                Text('Role: ${role.toUpperCase()}', style: TextStyle(color: Colors.teal.shade100, fontSize: 12)),
              ],
            ),
          ),
          ListTile(
            leading: const Icon(Icons.map),
            title: const Text('Explore & Book'),
            onTap: () => Navigator.of(context).pop(),
          ),
          ListTile(
            leading: const Icon(Icons.receipt_long),
            title: const Text('My Bookings & Receipts'),
            onTap: () {
              Navigator.of(context).pop();
              Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => BookingHistoryScreen(api: api)),
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.directions_car),
            title: const Text('My Vehicles'),
            onTap: () {
              Navigator.of(context).pop();
              Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => VehiclesScreen(api: api)),
              );
            },
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.storefront),
            title: const Text('Host & EV Dashboard'),
            onTap: () {
              Navigator.of(context).pop();
              Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => ProviderDashboardScreen(api: api)),
              );
            },
          ),
          if (role == 'admin')
            ListTile(
              leading: const Icon(Icons.shield_outlined),
              title: const Text('Admin Console'),
              onTap: () {
                Navigator.of(context).pop();
                Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => AdminScreen(api: api)),
                );
              },
            ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: const Text('Log Out', style: TextStyle(color: Colors.red)),
            onTap: () async {
              await api.clearSession();
              if (context.mounted) {
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute<void>(builder: (_) => LoginScreen(api: api)),
                  (r) => false,
                );
              }
            },
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final role = api.role;
    final isAdmin = role == 'admin';
    final isProvider = role == 'provider' || isAdmin;
    if (isAdmin) {
      // Admin: Map + Provider tools + Admin dashboard.
      return DefaultTabController(
        length: 3,
        child: Scaffold(
          drawer: _buildDrawer(context),
          appBar: AppBar(
            title: const Text('ParkPeer Admin'),
            actions: [_logoutButton()],
            bottom: const TabBar(
              tabs: [
                Tab(text: 'Map', icon: Icon(Icons.map)),
                Tab(text: 'Provider', icon: Icon(Icons.storefront)),
                Tab(text: 'Admin', icon: Icon(Icons.shield_outlined)),
              ],
            ),
          ),
          body: TabBarView(
            children: [
              MapScreen(api: api, nav: NavigationLauncher()),
              ProviderDashboardScreen(api: api),
              AdminScreen(api: api),
            ],
          ),
        ),
      );
    }
    return DefaultTabController(
      length: isProvider ? 2 : 1,
      child: Scaffold(
        drawer: _buildDrawer(context),
        appBar: AppBar(
          title: const Text('ParkPeer'),
          actions: [
            IconButton(
              icon: const Icon(Icons.receipt_long),
              tooltip: 'My Bookings',
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => BookingHistoryScreen(api: api)),
                );
              },
            ),
            _logoutButton(),
          ],
          bottom: isProvider
              ? const TabBar(
                  tabs: [
                    Tab(text: 'Map', icon: Icon(Icons.map)),
                    Tab(text: 'Host Dashboard', icon: Icon(Icons.storefront)),
                  ],
                )
              : null,
        ),
        body: isProvider
            ? TabBarView(
                children: [
                  MapScreen(api: api, nav: NavigationLauncher()),
                  ProviderDashboardScreen(api: api),
                ],
              )
            : MapScreen(api: api, nav: NavigationLauncher()),
      ),
    );
  }

  Widget _logoutButton() {
    return Builder(
      builder: (context) => IconButton(
        tooltip: 'Log out',
        icon: const Icon(Icons.logout),
        onPressed: () async {
          await api.clearSession();
          if (context.mounted) {
            Navigator.of(context).pushAndRemoveUntil(
              MaterialPageRoute<void>(builder: (_) => LoginScreen(api: api)),
              (r) => false,
            );
          }
        },
      ),
    );
  }
}