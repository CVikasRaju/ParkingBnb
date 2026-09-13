import 'package:flutter/material.dart';

import 'core/api_client.dart';
import 'core/deep_link.dart';
import 'features/admin/admin_screen.dart';
import 'features/map/map_screen.dart';
import 'features/provider/provider_screen.dart';

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
              ProviderScreen(api: api),
              AdminScreen(api: api),
            ],
          ),
        ),
      );
    }
    return DefaultTabController(
      length: isProvider ? 2 : 1,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('ParkPeer'),
          actions: [_logoutButton()],
          bottom: isProvider
              ? const TabBar(
                  tabs: [
                    Tab(text: 'Map', icon: Icon(Icons.map)),
                    Tab(text: 'Provider', icon: Icon(Icons.storefront)),
                  ],
                )
              : null,
        ),
        body: isProvider
            ? TabBarView(
                children: [
                  MapScreen(api: api, nav: NavigationLauncher()),
                  ProviderScreen(api: api),
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