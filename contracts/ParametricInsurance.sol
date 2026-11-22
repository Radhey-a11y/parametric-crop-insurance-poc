// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
contract ParametricInsurance {
    IERC20 public immutable token;
    address public owner;
    address public oracle;
    uint256 public reserved;
    uint256 public policyCount;
    uint256 public constant PREMIUM_BPS = 1000;
    struct Policy {
        address holder;
        string location;
        uint256 rainfallThreshold;
        uint256 payout;
        uint256 premium;
        uint256 expiry;
        bool settled;
        bool paidOut;
    }
    mapping(uint256 => Policy) public policies;
    event PoolFunded(address indexed provider, uint256 amount);
    event PolicyCreated(uint256 indexed id, address indexed holder, string location, uint256 threshold, uint256 payout);
    event WeatherReported(uint256 indexed id, uint256 actualRainfall);
    event PayoutExecuted(uint256 indexed id, address indexed holder, uint256 amount);
    event PolicyExpired(uint256 indexed id);
    modifier onlyOracle() { require(msg.sender == oracle, "Not oracle"); _; }
    constructor(address _token, address _oracle) {
        token = IERC20(_token);
        owner = msg.sender;
        oracle = _oracle;
    }
    function fundPool(uint256 amount) external {
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit PoolFunded(msg.sender, amount);
    }
    function createPolicy(string calldata _location, uint256 _rainfallThreshold, uint256 _payout, uint256 _durationDays)
        external returns (uint256 id)
    {
        uint256 premium = (_payout * PREMIUM_BPS) / 10000;
        uint256 available = token.balanceOf(address(this)) - reserved;
        require(available >= _payout, "Pool too small");
        require(token.transferFrom(msg.sender, address(this), premium), "Premium failed");
        reserved += _payout;
        id = ++policyCount;
        policies[id] = Policy(msg.sender, _location, _rainfallThreshold, _payout, premium,
            block.timestamp + _durationDays * 1 days, false, false);
        emit PolicyCreated(id, msg.sender, _location, _rainfallThreshold, _payout);
    }
    function fulfillWeatherData(uint256 _id, uint256 _actualRainfall) external onlyOracle {
        Policy storage p = policies[_id];
        require(p.holder != address(0) && !p.settled, "Invalid or settled");
        emit WeatherReported(_id, _actualRainfall);
        p.settled = true;
        reserved -= p.payout;
        if (_actualRainfall < p.rainfallThreshold) {
            p.paidOut = true;
            require(token.transfer(p.holder, p.payout), "Payout failed");
            emit PayoutExecuted(_id, p.holder, p.payout);
        }
    }
    function expirePolicy(uint256 _id) external {
        Policy storage p = policies[_id];
        require(!p.settled && block.timestamp > p.expiry, "Not expirable");
        p.settled = true;
        reserved -= p.payout;
        emit PolicyExpired(_id);
    }
}
